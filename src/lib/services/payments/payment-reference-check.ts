import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Runs after OCR reads a screenshot's GCash reference (owner, 2026-11-04):
 * 1. A transfer paid several orders: copy the reference to every payment in it.
 * 2. The reference is already on a payment outside this transfer (old screenshot
 *    reused, or a duplicate): mark the payment and tell the owners. It still saves.
 */

const MARK = '[GCash reference already used';

interface PaymentRow {
  id: string;
  order_id: string | null;
  transfer_id: string | null;
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
    .select('id, order_id, transfer_id, amount, notes, payment_date')
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

  // 2. Already used outside this transfer?
  const digits = referenceNumber?.match(/\d{8,}/)?.[0];
  if (!digits) return;
  const { data: matches } = await supabase
    .from('payments')
    .select('id, order_id, transfer_id, amount, notes, payment_date')
    .ilike('reference_number', `%${digits}%`)
    .limit(20);
  const earlier = ((matches || []) as PaymentRow[]).filter(
    (m) => !groupIds.includes(m.id) && !(p.transfer_id && m.transfer_id === p.transfer_id),
  );
  if (earlier.length === 0) return;

  const where = earlier
    .slice(0, 3)
    .map((m) => `#${shortId(m.order_id)} (${peso(Number(m.amount))}, ${phDate(m.payment_date)})`)
    .join(', ');
  const mark = `${MARK} on ${where}]`;

  const { data: own } = await supabase.from('payments').select('id, notes').in('id', groupIds);
  for (const row of (own || []) as { id: string; notes: string | null }[]) {
    if ((row.notes || '').includes(MARK)) continue;
    await supabase.from('payments').update({ notes: `${(row.notes || '').trim()} ${mark}`.trim() }).eq('id', row.id);
  }

  await notifyOwners(
    supabase,
    'GCash reference used twice',
    `Payment on #${shortId(p.order_id)} (${peso(Number(p.amount))}) has GCash ref ${digits}, already used on ${where}. ` +
      'Check if it is an old screenshot or a duplicate.',
  );
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
