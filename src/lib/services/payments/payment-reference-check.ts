import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Runs after OCR reads a screenshot's GCash reference (owner, 2026-11-04):
 * 1. A transfer paid several orders: copy the reference to every payment in it.
 * 2. More was recorded than the largest amount on the screenshot (e.g. the balance
 *    was typed instead of the ₱1,590 sent, #9BD7150 on 2026-11-05): mark it, tell owners.
 *    Only this direction: OCR takes the largest number, so a higher screenshot amount
 *    is often noise, but a lower one means the recorded money isn't on the screenshot.
 * 3. The reference is already on a payment outside this transfer (old screenshot
 *    reused, or a duplicate): mark the payment and tell the owners. It still saves.
 */

const MARK = '[GCash reference already used';
const AMOUNT_MARK = '[Screenshot says';

interface PaymentRow {
  id: string;
  order_id: string | null;
  transfer_id: string | null;
  transfer_amount?: number | string | null;
  amount: number | string;
  notes: string | null;
  payment_date: string | null;
}

const shortId = (id: string | null) => (id || '').slice(0, 7).toUpperCase();
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Philippine date (DB times are UTC). */
const phDate = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10) : '?';

export async function afterReferenceRead(
  supabase: SupabaseClient,
  paymentId: string,
  referenceNumber: string | null,
  ocrAmount: number | null,
): Promise<void> {
  const { data: payment } = await supabase
    .from('payments')
    .select('id, order_id, transfer_id, transfer_amount, amount, notes, payment_date')
    .eq('id', paymentId)
    .single();
  if (!payment) return;
  const p = payment as PaymentRow;

  // 1. Same reference on every payment of this transfer.
  let groupIds = [p.id];
  if (p.transfer_id) {
    const updates: Record<string, unknown> = {};
    if (referenceNumber) updates.reference_number = referenceNumber;
    if (ocrAmount !== null) updates.ocr_amount = ocrAmount;
    if (Object.keys(updates).length) {
      await supabase.from('payments').update(updates).eq('transfer_id', p.transfer_id).neq('id', p.id);
    }
    const { data: group } = await supabase.from('payments').select('id').eq('transfer_id', p.transfer_id);
    groupIds = (group || []).map((g: { id: string }) => g.id);
  }

  // 2. Recorded more than the screenshot shows?
  const recorded = Number(p.transfer_id ? p.transfer_amount ?? p.amount : p.amount);
  if (ocrAmount !== null && ocrAmount > 0 && ocrAmount < recorded - 1) {
    const flagged = await markPayments(
      supabase, groupIds, AMOUNT_MARK, `${AMOUNT_MARK} ${peso(ocrAmount)}, recorded ${peso(recorded)}]`,
    );
    if (flagged) {
      await notifyOwners(
        supabase,
        'Payment higher than its screenshot',
        `#${shortId(p.order_id)}: recorded ${peso(recorded)}, but the screenshot shows ${peso(ocrAmount)}. ` +
          'Check the proof and fix the payment if it was typed wrong.',
      );
    }
  }

  // 3. Already used outside this transfer?
  const digits = referenceNumber?.match(/\d{8,}/)?.[0];
  if (!digits) return;
  const { data: matches } = await supabase
    .from('payments')
    .select('id, order_id, transfer_id, transfer_amount, amount, notes, payment_date, ocr_amount')
    .ilike('reference_number', `%${digits}%`)
    .limit(20);
  const earlier = ((matches || []) as PaymentRow[]).filter(
    (m) => !groupIds.includes(m.id) && !(p.transfer_id && m.transfer_id === p.transfer_id),
  );
  if (earlier.length === 0) return;
  if (await isSplitOfOneTransfer(supabase, p, recorded, earlier, ocrAmount)) return;

  const where = earlier
    .slice(0, 3)
    .map((m) => `#${shortId(m.order_id)} (${peso(Number(m.amount))}, ${phDate(m.payment_date)})`)
    .join(', ');
  const mark = `${MARK} on ${where}]`;

  await markPayments(supabase, groupIds, MARK, mark);
  await notifyOwners(
    supabase,
    'GCash reference used twice',
    `Payment on #${shortId(p.order_id)} (${peso(Number(p.amount))}) has GCash ref ${digits}, already used on ${where}. ` +
      'Check if it is an old screenshot or a duplicate.',
  );
}

/** Our GCash numbers (owner, 2026-11-09): money must be sent to one of these. */
const OUR_GCASH = ['9171869554', '9232902128'];
const RECEIVER_MARK = '[Not sent to our GCash';

/**
 * GCash screenshots must show one of our two numbers as the receiver (owner,
 * 2026-11-09). GCash-to-GCash shows the full number; from another wallet or bank
 * it shows the customer's number and ours hidden ("•••• 9554"). Flagged: another PH
 * number and none of ours, or no receiver number at all (remittances, cropped or
 * blurry photos; owner said flag these too). Tested on 170 screenshots on
 * 2026-11-09: 147 ours, 23 no number, none showing another number wrongly.
 */
export function readReceiver(text: string): { ours: boolean; others: string[] } {
  const flat = text.replace(/\s+/g, ' ');
  const phones = (flat.match(/(?:\+\s*63|\b63|\b0)[\s-]*9\d{2}[\s-]*\d{3}[\s-]*\d{4}\b/g) || [])
    .map((p) => p.replace(/\D/g, '').slice(-10));
  if (phones.some((p) => OUR_GCASH.includes(p))) return { ours: true, others: [] };
  const lastFour = OUR_GCASH.map((n) => n.slice(-4)).join('|');
  const masked = new RegExp(`[*•●·xk]{2,}[\\s*•●·xk]*(?:${lastFour})\\b(?![.,]\\d)`, 'i');
  if (masked.test(flat)) return { ours: true, others: [] };
  return { ours: false, others: Array.from(new Set(phones)) };
}

export async function checkReceiver(
  supabase: SupabaseClient,
  paymentId: string,
  text: string,
): Promise<void> {
  const { data: payment } = await supabase
    .from('payments')
    .select('id, order_id, amount, payment_method')
    .eq('id', paymentId)
    .single();
  if (!payment) return;
  if (!/gcash|g-xchange/i.test(`${text} ${payment.payment_method || ''}`)) return;

  const { ours, others } = readReceiver(text);
  if (ours) return;
  const order = `#${shortId(payment.order_id)} (${peso(Number(payment.amount))})`;

  // No number at all (owner, 2026-11-09: flag these too): remittances, bank
  // slips, cropped or blurry screenshots. The owners check the proof.
  if (others.length === 0) {
    const flagged = await markPayments(supabase, [payment.id], RECEIVER_MARK, `${RECEIVER_MARK}? No receiver number on the screenshot]`);
    if (!flagged) return;
    await notifyOwners(
      supabase,
      'GCash receiver not shown',
      `Payment on ${order}: the screenshot doesn't show 0917 186 9554 or 0923 290 2128 (cropped, blurry, ` +
        'or a remittance/bank slip). Check the proof before counting this payment.',
    );
    return;
  }

  const shown = others.slice(0, 2).map((n) => `0${n}`).join(', ');
  const flagged = await markPayments(supabase, [payment.id], RECEIVER_MARK, `${RECEIVER_MARK}: screenshot shows ${shown}]`);
  if (!flagged) return;
  await notifyOwners(
    supabase,
    'GCash not sent to our number',
    `Payment on ${order}: the screenshot shows ${shown}, ` +
      'not 0917 186 9554 or 0923 290 2128. Check the proof before counting this payment.',
  );
}

const SPLIT_WINDOW_MS = 3 * 24 * 3600 * 1000;

/**
 * One GCash split by hand over the same customer's orders, without the "also paid
 * other orders" tick (e.g. a downpayment typed while creating a new order). Not a
 * reuse when: same customer, no cancelled order, within 3 days, and all payments
 * with this reference add up to no more than the screenshot. Found 2026-11-09:
 * ₱1,262 on #C3C41DD + ₱738 downpayment on new #F89542F = the ₱2,000 sent.
 */
async function isSplitOfOneTransfer(
  supabase: SupabaseClient,
  p: PaymentRow,
  recorded: number,
  earlier: (PaymentRow & { ocr_amount?: number | string | null })[],
  ocrAmount: number | null,
): Promise<boolean> {
  const screenshot = Math.max(ocrAmount ?? 0, ...earlier.map((m) => Number(m.ocr_amount) || 0));
  if (screenshot <= 0 || !p.order_id || earlier.some((m) => !m.order_id)) return false;

  const when = new Date(p.payment_date || Date.now()).getTime();
  if (earlier.some((m) => Math.abs(new Date(m.payment_date || 0).getTime() - when) > SPLIT_WINDOW_MS)) return false;

  // Count a several-orders transfer once (its transfer_amount), other payments by amount.
  let total = recorded;
  const seenTransfers = new Set(p.transfer_id ? [p.transfer_id] : []);
  for (const m of earlier) {
    if (m.transfer_id) {
      if (seenTransfers.has(m.transfer_id)) continue;
      seenTransfers.add(m.transfer_id);
      total += Number(m.transfer_amount ?? m.amount);
    } else {
      total += Number(m.amount);
    }
  }
  if (total > screenshot + 1) return false;

  const orderIds = Array.from(new Set([p.order_id, ...earlier.map((m) => m.order_id as string)]));
  const { data: orders } = await supabase.from('orders').select('id, customer_id, status').in('id', orderIds);
  const rows = (orders || []) as { id: string; customer_id: string | null; status: string | null }[];
  if (rows.length !== orderIds.length) return false;
  const customer = rows[0].customer_id;
  return rows.every(
    (o) => o.customer_id && o.customer_id === customer && !/cancel|void/i.test(o.status || ''),
  );
}

/** Adds a note to each payment that doesn't have it yet; false if all already had it. */
async function markPayments(supabase: SupabaseClient, ids: string[], marker: string, note: string): Promise<boolean> {
  const { data } = await supabase.from('payments').select('id, notes').in('id', ids);
  let changed = false;
  for (const row of (data || []) as { id: string; notes: string | null }[]) {
    if ((row.notes || '').includes(marker)) continue;
    await supabase.from('payments').update({ notes: `${(row.notes || '').trim()} ${note}`.trim() }).eq('id', row.id);
    changed = true;
  }
  return changed;
}

/** Bell notification for everyone whose role is owner/admin (same lookup as returns). */
async function notifyOwners(supabase: SupabaseClient, title: string, message: string) {
  const { data, error } = await supabase.rpc('get_all_users');
  if (error) return;
  const names = Array.from(new Set(
    ((data || []) as { raw_user_meta_data?: Record<string, unknown> }[])
      .filter((u) => {
        const meta = u.raw_user_meta_data || {};
        const roles: unknown[] = Array.isArray(meta.roles) ? meta.roles : meta.role ? [meta.role] : [];
        return roles.some((r) => ['owner', 'admin'].includes(String(r).toLowerCase()));
      })
      .map((u) => `${u.raw_user_meta_data?.first_name || ''} ${u.raw_user_meta_data?.last_name || ''}`.trim())
      .filter(Boolean),
  ));
  if (names.length === 0) return;
  await supabase.from('notifications').insert(names.map((name) => ({
    sales_person_name: name,
    title,
    message: message.length > 240 ? `${message.slice(0, 237)}...` : message,
    link: '/dashboard/accounting/payments',
    is_read: false,
  })));
}
