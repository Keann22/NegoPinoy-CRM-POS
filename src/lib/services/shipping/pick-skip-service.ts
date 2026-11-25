import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ASK_AGAIN_HOURS, NOT_PICKED_STATUSES, OWNER_AFTER_DAYS, PICK_LEAD_DAYS, addDaysPht, pickStartsOn, shortOrderId,
} from '@/lib/shipping/ship-hold-rules';
import {
  PICK_SKIP_REASONS, type PickDeferral, type PickQuestion, type PickSkipAnswer, type PickSkipInfo, type PickSkipReason,
} from '@/types/pick-skips.types';

/*
 * Ship later and "Don't pick yet" (owner, 2026-11-25). We run lean: an order
 * that ships on a later date isn't picked until 3 days before (a "date" ship
 * hold), so its shelf pieces stay free for other orders and it isn't bought for.
 * Found 2026-11-25: 7 orders sat on Ready to Pick that staff kept skipping;
 * "reserve for December" was only in the notes, and 4 had no reason at all.
 * Now staff tap "Don't pick yet" with a reason, and the order's sales agent
 * sets the ship date or says pick it now. Server only (service role).
 */

export class PickSkipError extends Error {}

const TABLE = 'order_pick_skips';
const COLS = 'id, order_id, reason, note, created_by_name, created_at, ask_again_at';

interface SkipRow {
  id: string; order_id: string; reason: PickSkipReason; note: string | null;
  created_by_name: string | null; created_at: string; ask_again_at: string | null;
}
interface OrderRow {
  id: string; status: string; sales_person_name: string | null;
  customers?: { full_name: string | null } | { full_name: string | null }[] | null;
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const infoOf = (r: SkipRow): PickSkipInfo => ({ id: r.id, reason: r.reason, note: r.note, byName: r.created_by_name, at: r.created_at });

/**
 * Orders that ship later and are too early to pick: an active "date" ship hold
 * whose ship date is more than 3 days away, on an order not picked yet.
 */
export async function getDeferredPicks(supabase: SupabaseClient, orderIds?: string[]): Promise<Map<string, PickDeferral>> {
  let q = supabase.from('order_ship_holds')
    .select('order_id, check_on, note, orders!inner(status)')
    .is('released_at', null).eq('kind', 'date')
    .gt('check_on', addDaysPht(PICK_LEAD_DAYS))
    .in('orders.status', NOT_PICKED_STATUSES);
  if (orderIds) q = q.in('order_id', orderIds);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  const out = new Map<string, PickDeferral>();
  ((data || []) as { order_id: string; check_on: string; note: string | null }[]).forEach((h) => {
    out.set(h.order_id, { shipOn: h.check_on, pickFrom: pickStartsOn(h.check_on), note: h.note });
  });
  return out;
}

/** Open "Don't pick yet" questions per order. */
export async function getOpenPickSkips(supabase: SupabaseClient, orderIds?: string[]): Promise<Map<string, PickSkipInfo>> {
  let q = supabase.from(TABLE).select(COLS).is('resolved_at', null);
  if (orderIds) q = q.in('order_id', orderIds);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return new Map(((data || []) as SkipRow[]).map((r) => [r.order_id, infoOf(r)]));
}

async function logOrder(supabase: SupabaseClient, orderId: string, status: string, userName: string, snapshot: Record<string, unknown>) {
  await supabase.from('order_logs').insert({ order_id: orderId, status, user_name: userName, snapshot_data: snapshot });
}

/** The warehouse didn't pick it: say why. Sales gets the question. */
export async function createPickSkip(
  supabase: SupabaseClient, input: { orderId: string; reason: PickSkipReason; note: string }, actorName: string,
): Promise<void> {
  if (!PICK_SKIP_REASONS[input.reason]) throw new PickSkipError('Pick a reason.');
  const note = input.note.trim();
  if (input.reason === 'other' && !note) throw new PickSkipError('Write the reason in the note.');
  const { data: order, error } = await supabase.from('orders').select('id, status').eq('id', input.orderId).maybeSingle();
  if (error) throw error;
  if (!order) throw new PickSkipError('Order not found.');
  if (!NOT_PICKED_STATUSES.includes(order.status)) throw new PickSkipError(`This order is already ${order.status}.`);

  // One open question per order: a new skip replaces the old one.
  await resolvePickSkips(supabase, [input.orderId], 'replaced', actorName);
  const { error: e2 } = await supabase.from(TABLE).insert({
    order_id: input.orderId, reason: input.reason, note: note || null, created_by_name: actorName,
  });
  if (e2) throw e2;
  await logOrder(supabase, input.orderId, 'Not Picked Yet', actorName, { reason: PICK_SKIP_REASONS[input.reason].label, note: note || null });
}

/** Close the open questions on these orders (sales set a hold, said pick it, or the order moved on). */
export async function resolvePickSkips(supabase: SupabaseClient, orderIds: string[], resolution: string, actorName: string): Promise<void> {
  if (orderIds.length === 0) return;
  const { error } = await supabase.from(TABLE)
    .update({ resolved_at: new Date().toISOString(), resolved_by_name: actorName, resolution })
    .in('order_id', orderIds).is('resolved_at', null);
  if (error) throw error;
}

export async function answerPickSkip(supabase: SupabaseClient, id: string, answer: PickSkipAnswer, actorName: string): Promise<void> {
  const { data, error } = await supabase.from(TABLE).select(COLS).eq('id', id).is('resolved_at', null).maybeSingle();
  if (error) throw error;
  if (!data) throw new PickSkipError('This was already answered.');
  const row = data as SkipRow;
  if (answer === 'waiting') {
    const { error: e2 } = await supabase.from(TABLE)
      .update({ ask_again_at: new Date(Date.now() + ASK_AGAIN_HOURS * 3600000).toISOString() }).eq('id', id);
    if (e2) throw e2;
    return;
  }
  await resolvePickSkips(supabase, [row.order_id], 'pick_now', actorName);
  await logOrder(supabase, row.order_id, 'Pick It Now', actorName, { answered: 'Sales: pick it now' });
}

/**
 * Pop-up cards: open questions on orders still not picked. For the order's
 * sales agent; owners also get those with no agent and those 3+ days old.
 */
export async function listPickQuestions(
  supabase: SupabaseClient, caller: { name: string; isManagement: boolean },
): Promise<PickQuestion[]> {
  const { data, error } = await supabase.from(TABLE).select(COLS).is('resolved_at', null).limit(2000);
  if (error) throw error;
  const nowMs = Date.now();
  const rows = ((data || []) as SkipRow[]).filter((r) => !r.ask_again_at || new Date(r.ask_again_at).getTime() <= nowMs);
  if (rows.length === 0) return [];

  const orders = new Map<string, OrderRow>();
  const ids = rows.map((r) => r.order_id);
  for (let i = 0; i < ids.length; i += 150) {
    const { data: o, error: e2 } = await supabase.from('orders')
      .select('id, status, sales_person_name, customers(full_name)').in('id', ids.slice(i, i + 150));
    if (e2) throw e2;
    ((o || []) as unknown as OrderRow[]).forEach((x) => orders.set(x.id, x));
  }

  const me = caller.name.trim().toLowerCase();
  const ownerCutoff = new Date(nowMs - OWNER_AFTER_DAYS * 86400000).toISOString();
  const out: PickQuestion[] = [];
  for (const r of rows) {
    const o = orders.get(r.order_id);
    if (!o || !NOT_PICKED_STATUSES.includes(o.status)) continue;
    const agent = (o.sales_person_name || '').trim();
    const mine = !!agent && agent.toLowerCase() === me;
    const overdue = r.created_at <= ownerCutoff;
    if (!mine && !(caller.isManagement && (!agent || overdue))) continue;
    out.push({
      ...infoOf(r),
      orderId: o.id,
      shortId: shortOrderId(o.id),
      status: o.status,
      customerName: one(o.customers)?.full_name || 'Customer',
      salesPersonName: agent || null,
      overdue: !mine && overdue,
    });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
