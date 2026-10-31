import { SupabaseClient } from '@supabase/supabase-js';
import { applyPhysicalShelfCount } from './inventory-guardian-action-service';
import type { RecountRequest } from '@/types/inventory-guardian.types';
import { getShelfForProducts } from './picker-shelf-guard-service';
import { sendTelegramMessage } from './inventory-guardian-telegram-service';

/*
 * Recount requests: an owner asks Jas to count specific products. Every Jas
 * account gets a sticky pop-up until each product is counted. Jas counts Unit 1
 * (shelf) and Unit 2 (reserve) separately, so the count also fixes the split
 * between the two units. Saved like a Guardian shelf count.
 */

/** Accounts that get the recount pop-up (Jas's accounts). */
export const RECOUNT_ASSIGNEE_EMAILS = ['jas@gmail.com', 'jas@usares.com', 'jassy@gmail.com'];

export class RecountError extends Error {}

export function isRecountAssignee(email: string | null | undefined): boolean {
  return RECOUNT_ASSIGNEE_EMAILS.includes(String(email || '').toLowerCase().trim());
}

export async function listOpenRecounts(supabase: SupabaseClient): Promise<RecountRequest[]> {
  const { data, error } = await supabase
    .from('recount_requests')
    .select('id, batch_id, product_id, message, requested_by_name, created_at, products(name, variant_name, sku)')
    .eq('status', 'open')
    .order('created_at');
  if (error) throw error;
  return (data || []).map((r: any) => {
    const p = Array.isArray(r.products) ? r.products[0] : r.products;
    const name = p?.variant_name && !String(p.name).includes(p.variant_name) ? `${p.name} [${p.variant_name}]` : p?.name;
    return {
      id: r.id,
      batchId: r.batch_id,
      productId: r.product_id,
      productName: name || 'Unknown product',
      sku: p?.sku || null,
      message: r.message,
      requestedByName: r.requested_by_name,
      createdAt: r.created_at,
    };
  });
}

/** One pop-up: the same message for a list of products. */
export async function createRecountBatch(supabase: SupabaseClient, productIds: string[], message: string, requestedByName: string) {
  const batchId = crypto.randomUUID();
  const { error } = await supabase.from('recount_requests').insert(
    productIds.map((product_id) => ({ batch_id: batchId, product_id, message, requested_by_name: requestedByName }))
  );
  if (error) throw error;
  return batchId;
}

/** Saves Jas's count: Unit 2 set to what she counted there, total = Unit 1 + Unit 2. */
export async function completeRecount(
  supabase: SupabaseClient,
  input: { id: string; unit1: number; unit2: number; actorName: string }
) {
  const unit1 = Math.round(Number(input.unit1));
  const unit2 = Math.round(Number(input.unit2));
  if (!(unit1 >= 0) || !(unit2 >= 0)) throw new RecountError('Ilagay ang bilang sa Unit 1 at Unit 2 (0 kung wala).');

  const { data: req, error } = await supabase.from('recount_requests').select('*').eq('id', input.id).single();
  if (error || !req) throw new RecountError('Request not found.');
  if (req.status !== 'open') throw new RecountError('Nabilang na ito.');

  const systemBefore = (await getShelfForProducts(supabase, [req.product_id]))[req.product_id]?.unallocated ?? null;

  // Claim it first so two Jas accounts can't save the same item twice.
  const { data: claimed } = await supabase
    .from('recount_requests')
    .update({ status: 'done', counted_unit1: unit1, counted_unit2: unit2, system_before: systemBefore, done_by_name: input.actorName, done_at: new Date().toISOString() })
    .eq('id', req.id).eq('status', 'open').select('id');
  if (!claimed || claimed.length === 0) throw new RecountError('Nabilang na ito.');

  try {
    const { data: wh } = await supabase.from('warehouses').select('id').eq('code', 'UNIT2').maybeSingle();
    if (wh) {
      const { data: row } = await supabase
        .from('product_warehouse_stock').select('stock_level').eq('product_id', req.product_id).eq('warehouse_id', wh.id).maybeSingle();
      const before = Number(row?.stock_level) || 0;
      if (before !== unit2) {
        if (row) {
          await supabase.from('product_warehouse_stock').update({ stock_level: unit2 }).eq('product_id', req.product_id).eq('warehouse_id', wh.id);
        } else {
          await supabase.from('product_warehouse_stock').insert({ product_id: req.product_id, warehouse_id: wh.id, stock_level: unit2 });
        }
        await supabase.from('inventory_movements').insert({
          product_id: req.product_id,
          quantity_change: unit2 - before,
          movement_type: 'adjustment',
          warehouse_id: wh.id,
          timestamp: new Date().toISOString(),
          reason: `Recount (Unit 2 reserve) by ${input.actorName}: ${unit2} (was ${before}). Requested by ${req.requested_by_name || 'owner'}.`,
          performed_by_name: input.actorName,
        });
      }
    }

    await applyPhysicalShelfCount(supabase, {
      productId: req.product_id,
      physicalShelfCount: unit1 + unit2,
      notes: `Recount requested by ${req.requested_by_name || 'owner'}: Unit 1 ${unit1} + Unit 2 ${unit2}. Counted by ${input.actorName}.`,
      actorName: input.actorName,
    });
  } catch (e) {
    // Put it back on the list so the count isn't lost silently.
    await supabase.from('recount_requests').update({ status: 'open', done_by_name: null, done_at: null }).eq('id', req.id);
    throw e;
  }

  try {
    await notifyIfBatchDone(supabase, req.batch_id);
  } catch (e) {
    console.error('Recount: Telegram finished message failed', e);
  }
}

// ---------------------------------------------------------------------------
// Telegram to the owner: when Jas finishes a batch, and at noon if she hasn't
// ---------------------------------------------------------------------------

const PH_TZ = 'Asia/Manila';
const phDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: PH_TZ }).format(d); // YYYY-MM-DD
const phTime = (iso: string) => new Date(iso).toLocaleString('en-PH', { timeZone: PH_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function batchRows(supabase: SupabaseClient, batchId: string) {
  const { data, error } = await supabase
    .from('recount_requests')
    .select('id, status, message, requested_by_name, counted_unit1, counted_unit2, system_before, done_by_name, done_at, products(name)')
    .eq('batch_id', batchId)
    .order('created_at');
  if (error) throw error;
  return (data || []).map((r: any) => ({ ...r, productName: (Array.isArray(r.products) ? r.products[0] : r.products)?.name || 'Item' }));
}

/** After a save: if the whole batch is counted, send the results once. */
export async function notifyIfBatchDone(supabase: SupabaseClient, batchId: string) {
  const rows = await batchRows(supabase, batchId);
  if (rows.length === 0 || rows.some((r) => r.status === 'open')) return;
  const { data: claimed } = await supabase
    .from('recount_requests').update({ done_notified_at: new Date().toISOString() })
    .eq('batch_id', batchId).is('done_notified_at', null).select('id');
  if (!claimed || claimed.length === 0) return; // already sent

  const lines = rows.filter((r) => r.status === 'done').map((r) => {
    const total = (r.counted_unit1 || 0) + (r.counted_unit2 || 0);
    const before = r.system_before;
    const diff = before == null ? null : before - total;
    const verdict = diff == null ? '' : diff > 0 ? `, sobra ng ${diff} ang system` : diff < 0 ? `, kulang ng ${-diff} ang system` : ', tama ang system';
    return `✅ ${esc(r.productName)}: <b>${total}</b> (Unit 1 ${r.counted_unit1}, Unit 2 ${r.counted_unit2})` +
      `${before != null ? `, dati ${before}` : ''}${verdict} — ${esc(r.done_by_name || 'Jas')}, ${phTime(r.done_at)}`;
  });
  const text = [
    `<b>Tapos na ang pabilang ni Jas</b>`,
    `"${esc(rows[0].message)}"`,
    '',
    ...lines,
    '',
    'Na-update na ang stocks sa bilang niya.',
  ].join('\n');
  const sent = await sendTelegramMessage(text);
  if (!sent.success) {
    await supabase.from('recount_requests').update({ done_notified_at: null }).eq('batch_id', batchId);
    throw new Error(sent.error);
  }
}

/**
 * Noon check (Vercel cron, 12:00 PM PH): batches still open on or after their
 * due date get one reminder per day. Skips Sundays. `dryRun` reports without sending.
 */
export async function remindUnfinishedRecounts(supabase: SupabaseClient, now = new Date(), dryRun = false) {
  const today = phDate(now);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: PH_TZ, weekday: 'short' }).format(now);
  if (weekday === 'Sun' && !dryRun) return { sent: 0, skipped: 'Sunday' };

  const { data, error } = await supabase
    .from('recount_requests').select('batch_id, due_date, created_at, last_reminded_on').eq('status', 'open');
  if (error) throw error;
  const due = new Set<string>();
  (data || []).forEach((r: any) => {
    const dueDate = r.due_date || phDate(new Date(r.created_at));
    if (dueDate <= today && (!r.last_reminded_on || r.last_reminded_on < today)) due.add(r.batch_id);
  });
  if (dryRun) return { sent: 0, wouldRemind: due.size };

  let sent = 0;
  for (const batchId of Array.from(due)) {
    // Claim today's reminder for this batch first (cron retries or repeat calls send it once).
    const { data: claimed } = await supabase
      .from('recount_requests').update({ last_reminded_on: today })
      .eq('batch_id', batchId).eq('status', 'open').or(`last_reminded_on.is.null,last_reminded_on.lt.${today}`).select('id');
    if (!claimed || claimed.length === 0) continue;
    const rows = await batchRows(supabase, batchId);
    const open = rows.filter((r) => r.status === 'open');
    const text = [
      `<b>⏰ Hindi pa tapos ni Jas ang pabilang</b> (12 PM)`,
      `"${esc(rows[0].message)}"`,
      '',
      `${open.length} sa ${rows.length} ang hindi pa nabibilang:`,
      ...open.map((r) => `• ${esc(r.productName)}`),
      '',
      'Naka-pop-up pa rin sa kanya hanggang mabilang lahat.',
    ].join('\n');
    const res = await sendTelegramMessage(text);
    if (res.success) sent += 1;
    else await supabase.from('recount_requests').update({ last_reminded_on: null }).eq('batch_id', batchId).eq('status', 'open');
  }
  return { sent };
}
