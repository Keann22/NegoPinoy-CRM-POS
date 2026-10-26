import type { SupabaseClient } from '@supabase/supabase-js';
import { phtDate } from '@/lib/priority/priority-rules';

/**
 * Borrowing an item that was already picked for one order (the donor) to fill
 * another. The donor is reopened with an OS issue and a buy request for the
 * replacement, and its sales person is told, so nobody loses an item silently.
 * Stock is not adjusted: both orders reserved their unit at creation; one unit
 * only moved physically between set-aside piles.
 */

export const BORROWS_TABLE = 'order_borrows';

/** Orders whose items are already off the shelf and set aside (not yet with the courier). */
export const DONOR_STATUSES = ['Picked', 'Picked (with issue)', 'Photo', 'Packed', 'For Shipping'];

const DAY = 24 * 60 * 60 * 1000;

export interface BorrowCandidate {
  orderId: string;
  shortId: string;
  customerName: string | null;
  salesPersonName: string | null;
  status: string;
  qty: number;
  paymentMethod: string | null;
  fullyPaid: boolean;
  daysSinceOrder: number;
  /** Reasons to think twice before borrowing from this order. */
  warnings: string[];
}

const short = (id: string) => id.slice(0, 7).toUpperCase();

/** Orders holding this product that it could be borrowed from, safest first. */
export async function listBorrowCandidates(
  supabase: SupabaseClient,
  productId: string,
  toOrderId: string,
  now = new Date()
): Promise<BorrowCandidate[]> {
  const { data: lines, error } = await supabase
    .from('order_items')
    .select('order_id, quantity, orders!inner(id, status, payment_method, balance_due, order_date, created_at, sales_person_name, customers(full_name))')
    .eq('product_id', productId)
    .in('orders.status', DONOR_STATUSES)
    .neq('order_id', toOrderId)
    .limit(200);
  if (error) throw error;
  if (!lines || lines.length === 0) return [];

  const orderIds = Array.from(new Set(lines.map((l: any) => l.order_id)));
  const [{ data: issues }, { data: events }] = await Promise.all([
    supabase.from('order_issues').select('order_id').eq('product_id', productId).eq('status', 'open').in('order_id', orderIds),
    supabase.from('order_priority_events').select('order_id, kind, send_date, created_at')
      .in('kind', ['send_today', 'send_today_blocked', 'send_today_cancelled']).in('order_id', orderIds),
  ]);
  // Already short on this item: nothing there to borrow.
  const alreadyShort = new Set((issues || []).map((i: any) => i.order_id));

  const latestSend = new Map<string, any>();
  (events || []).forEach((e: any) => {
    const prev = latestSend.get(e.order_id);
    if (!prev || e.created_at > prev.created_at) latestSend.set(e.order_id, e);
  });

  const byOrder = new Map<string, BorrowCandidate>();
  for (const l of lines as any[]) {
    if (alreadyShort.has(l.order_id)) continue;
    const o = l.orders;
    const existing = byOrder.get(o.id);
    if (existing) { existing.qty += Number(l.quantity || 0); continue; }

    const fullyPaid = o.payment_method !== 'COD' && Number(o.balance_due || 0) < 1;
    const daysSinceOrder = Math.floor((now.getTime() - new Date(o.order_date || o.created_at).getTime()) / DAY);
    const send = latestSend.get(o.id);
    const warnings: string[] = [];
    if (send?.kind === 'send_today' && send.send_date <= phtDate(now)) warnings.push('Marked "send today"');
    if (['Packed', 'For Shipping'].includes(o.status)) warnings.push('Already packed — the box must be reopened');
    if (fullyPaid) warnings.push(`Customer already fully paid${o.payment_method === 'Lay-away' ? ' (lay-away)' : ''}`);
    if (daysSinceOrder >= 14) warnings.push(`Customer has waited ${daysSinceOrder} days`);

    byOrder.set(o.id, {
      orderId: o.id,
      shortId: short(o.id),
      customerName: o.customers?.full_name ?? null,
      salesPersonName: o.sales_person_name,
      status: o.status,
      qty: Number(l.quantity || 0),
      paymentMethod: o.payment_method,
      fullyPaid,
      daysSinceOrder,
      warnings,
    });
  }

  // Safest donors first: fewest warnings, then the newest order (shortest wait so far).
  return Array.from(byOrder.values()).sort((a, b) =>
    a.warnings.length - b.warnings.length || a.daysSinceOrder - b.daysSinceOrder);
}

export interface BorrowInput {
  productId: string;
  qty: number;
  fromOrderId: string;
  toOrderId: string;
  note?: string | null;
}

/** Records a borrow and reopens the donor order. Returns the donor's short order number. */
export async function recordBorrow(
  supabase: SupabaseClient,
  input: BorrowInput,
  editor: { id: string; name: string },
  baseUrl: string
): Promise<{ fromShortId: string }> {
  const { productId, qty, fromOrderId, toOrderId } = input;

  const [{ data: donor }, { data: receiver }] = await Promise.all([
    supabase.from('orders').select('id, status, sales_person_name, order_items(id, product_id, product_name, quantity)').eq('id', fromOrderId).maybeSingle(),
    supabase.from('orders').select('id').eq('id', toOrderId).maybeSingle(),
  ]);
  if (!donor || !receiver) throw new BorrowError('Order not found');
  if (!DONOR_STATUSES.includes(donor.status)) throw new BorrowError(`#${short(fromOrderId)} is ${donor.status}, so its items aren't set aside to borrow.`);

  const donorLines = (donor.order_items || []).filter((i: any) => i.product_id === productId);
  const donorQty = donorLines.reduce((s: number, i: any) => s + Number(i.quantity || 0), 0);
  if (donorQty < qty) throw new BorrowError(`#${short(fromOrderId)} only has ${donorQty} of this item.`);

  const { data: openIssue } = await supabase.from('order_issues').select('id')
    .eq('order_id', fromOrderId).eq('product_id', productId).eq('status', 'open').limit(1).maybeSingle();
  if (openIssue) throw new BorrowError(`#${short(fromOrderId)} is already short on this item.`);

  const productName = donorLines[0].product_name;
  const toShort = short(toOrderId);
  const fromShort = short(fromOrderId);

  // 0. The record itself first, so nothing else changes if it can't be saved.
  const { error: borrowErr } = await supabase.from(BORROWS_TABLE).insert({
    product_id: productId, product_name: productName, qty, from_order_id: fromOrderId, to_order_id: toOrderId,
    from_status: donor.status, note: input.note?.trim() || null, created_by_id: editor.id, created_by_name: editor.name,
  });
  if (borrowErr) throw borrowErr;

  // 1. Donor is short now: OS issue, with a message saying why.
  const { data: issue, error: issueErr } = await supabase.from('order_issues').insert({
    order_id: fromOrderId, product_id: productId, status: 'open', issue_type: 'order',
    reported_by_name: editor.name, out_of_stock_qty: qty,
  }).select('id').single();
  if (issueErr) throw issueErr;
  await supabase.from('order_issue_messages').insert({
    issue_id: issue.id, sender_role: 'picker', sender_name: editor.name,
    message: `${qty}× ${productName} was borrowed for order #${toShort}. A replacement has been requested.`,
  });

  // 2. Reopen the donor so it can't be packed or shipped without the item.
  await supabase.from('order_items').update({ is_packed: false }).in('id', donorLines.map((i: any) => i.id));
  if (donor.status !== 'Picked (with issue)') {
    await supabase.from('orders').update({ status: 'Picked (with issue)' }).eq('id', fromOrderId);
  }

  // 3. A line in each order's trail.
  await supabase.from('order_logs').insert([
    { order_id: fromOrderId, status: 'Item Borrowed', user_name: editor.name, snapshot_data: { productName, qty, toOrderId } },
    { order_id: toOrderId, status: 'Borrowed Item', user_name: editor.name, snapshot_data: { productName, qty, fromOrderId } },
  ]);

  // 4. Replacement on the buy list (same call the picker makes on an OS scan).
  const res = await fetch(new URL('/api/inventory/procurement-request', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ productId, requestedQty: qty, orderId: fromOrderId }], requestedByName: editor.name }),
  });
  if (!res.ok) console.error('Borrow: replacement buy request failed', await res.text().catch(() => ''));

  // 5. Tell the donor order's sales person.
  if (donor.sales_person_name) {
    await supabase.from('notifications').insert({
      sales_person_name: donor.sales_person_name,
      title: 'Item borrowed from your order',
      message: `${qty}× ${productName} was taken from order #${fromShort} for #${toShort} by ${editor.name}. A replacement has been requested.`,
      link: '/dashboard/priority',
    });
  }

  return { fromShortId: fromShort };
}

export class BorrowError extends Error {}
