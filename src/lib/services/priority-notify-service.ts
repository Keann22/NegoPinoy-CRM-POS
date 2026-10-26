import type { SupabaseClient } from '@supabase/supabase-js';
import { ALWAYS_NOTIFY_NAMES } from './staff-message-service';

/**
 * Bell notifications for the priority list:
 *  - "now fully paid": a lay-away / installment / pending order just reached ₱0
 *    balance, so the warehouse can act on it right away (once per order).
 *  - "nagmamadali": sales marked the customer as in a hurry, so the owner can
 *    follow up or buy what's missing.
 * Both list the order's missing (OS) items.
 */

const PAID_CHECK_METHODS = ['Lay-away', 'Installment', 'Pending'];
const OPEN_STATUSES = [
  'Pending Payment', 'Processing', 'Picked', 'Picked (with issue)', 'Photo',
  'Packed', 'For Shipping', 'On-Hold', 'Waiting for Stock',
];
/** Only payments this recent count as "just paid" (so old paid orders don't all notify at once). */
const RECENT_MS = 3 * 24 * 60 * 60 * 1000;

const short = (id: string) => id.slice(0, 7).toUpperCase();

function dedupe(names: string[], exclude?: string | null): string[] {
  const seen = new Set<string>();
  const ex = exclude?.trim().toLowerCase();
  return names.filter((n) => {
    const k = n.trim().toLowerCase();
    if (!k || k === ex || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Names of staff with any of these roles, plus the always-notify (jas) accounts. */
async function staffNames(supabase: SupabaseClient, roles: string[]): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_all_users');
  if (error) return [...ALWAYS_NOTIFY_NAMES];
  const names = (data || [])
    .filter((u: any) => {
      const meta = u.raw_user_meta_data || {};
      const userRoles: string[] = Array.isArray(meta.roles) ? meta.roles : meta.role ? [meta.role] : [];
      return userRoles.some((r) => roles.includes(String(r).toLowerCase()));
    })
    .map((u: any) => `${u.raw_user_meta_data?.first_name || ''} ${u.raw_user_meta_data?.last_name || ''}`.trim());
  return [...names, ...ALWAYS_NOTIFY_NAMES];
}

/** "22 items, 2 missing: Hilee round casserole 2.4L, Paella pan" */
async function itemSummary(supabase: SupabaseClient, orderId: string): Promise<string> {
  const [{ count }, { data: issues }] = await Promise.all([
    supabase.from('order_items').select('id', { count: 'exact', head: true }).eq('order_id', orderId),
    supabase.from('order_issues').select('products(name)').eq('order_id', orderId).eq('issue_type', 'order').eq('status', 'open'),
  ]);
  const missing = (issues || []).map((i: any) => i.products?.name).filter(Boolean);
  const items = `${count ?? 0} item${count === 1 ? '' : 's'}`;
  return missing.length ? `${items}, ${missing.length} missing: ${missing.join(', ')}` : `${items}, nothing reported missing`;
}

async function notify(supabase: SupabaseClient, names: string[], title: string, message: string) {
  if (names.length === 0) return;
  await supabase.from('notifications').insert(names.map((name) => ({
    sales_person_name: name,
    title,
    message: message.length > 240 ? `${message.slice(0, 237)}...` : message,
    link: '/dashboard/priority',
    is_read: false,
  })));
}

/** Tells the owner/admins (and jas) that a customer is in a hurry. */
export async function notifyUrgent(supabase: SupabaseClient, orderId: string, note: string, byName: string) {
  const { data: o } = await supabase.from('orders').select('customers(full_name)').eq('id', orderId).maybeSingle();
  const customer = (o as any)?.customers?.full_name || 'Customer';
  const names = dedupe(await staffNames(supabase, ['owner', 'admin']), byName);
  await notify(supabase, names, 'Customer is in a hurry (nagmamadali)',
    `#${short(orderId)} ${customer}: “${note}” — ${byName}. ${await itemSummary(supabase, orderId)}.`);
}

/**
 * Finds orders that just became fully paid and notifies once per order.
 * With an orderId, checks only that order (right after a payment is saved);
 * without, sweeps recent payments (safety net for payments entered elsewhere).
 */
export async function checkNewlyPaid(supabase: SupabaseClient, orderId?: string): Promise<number> {
  let candidateIds: string[];
  if (orderId) {
    candidateIds = [orderId];
  } else {
    const since = new Date(Date.now() - RECENT_MS).toISOString();
    const { data: recent } = await supabase.from('payments').select('order_id').gte('created_at', since).limit(1000);
    candidateIds = Array.from(new Set((recent || []).map((p: any) => p.order_id)));
  }
  if (candidateIds.length === 0) return 0;

  const { data: orders } = await supabase
    .from('orders')
    .select('id, status, payment_method, balance_due, customers(full_name)')
    .in('id', candidateIds.slice(0, 300))
    .in('status', OPEN_STATUSES)
    .in('payment_method', PAID_CHECK_METHODS)
    .lt('balance_due', 1);
  if (!orders || orders.length === 0) return 0;

  const { data: done } = await supabase.from('order_priority_events').select('order_id')
    .eq('kind', 'paid_notice').in('order_id', orders.map((o: any) => o.id));
  const already = new Set((done || []).map((d: any) => d.order_id));

  let sent = 0;
  let recipients: string[] | null = null;
  for (const o of orders as any[]) {
    if (already.has(o.id)) continue;
    // Claim the notice first; the unique index makes a second screen's claim fail.
    const { error } = await supabase.from('order_priority_events').insert({
      order_id: o.id, kind: 'paid_notice', created_by_name: 'System',
    });
    if (error) continue;
    recipients ??= dedupe(await staffNames(supabase, ['owner', 'admin', 'inventory']));
    await notify(supabase, recipients, 'Order is now fully paid',
      `#${short(o.id)} ${o.customers?.full_name || 'Customer'} (${o.payment_method}) is now fully paid — ${await itemSummary(supabase, o.id)}.`);
    sent++;
  }
  return sent;
}
