import { SupabaseClient } from '@supabase/supabase-js';
import { getShelfForProducts } from './picker-shelf-guard-service';

/*
 * "Picker found more than the system expected" (owners' bell). The bell only
 * stores one line of text, so the details pop-up looks up what happened next:
 * the count itself, what the picker then did on that order, every later shelf
 * change of the product, and whether a purchase of it was recorded.
 * No supplier names or costs here.
 */

export const PICKER_FOUND_MORE_TITLE = 'Picker found more than the system expected';

export interface PickerCountEvent {
  at: string;
  change: number;
  label: string;
}

export interface PickerCountFollowUp {
  productId: string;
  productName: string;
  pickerName: string;
  counted: number;
  expected: number;
  countedAt: string;
  /** The order being picked when the count was made. */
  order: {
    id: string;
    shortId: string;
    status: string;
    need: number;
    picked: number;
    os: number;
  } | null;
  /** Shelf changes of this product after the count (newest last). */
  events: PickerCountEvent[];
  /** What pickers see as on the shelf now (locked formula). */
  shelfNow: number | null;
  purchases: {
    lastBeforeCount: { at: string; qty: number } | null;
    sinceCount: { at: string; qty: number; received: number }[];
  };
}

const MESSAGE_RE = /^(.*): (.+?) counted (\d+) while picking(?: #([0-9A-F]{8}))?; the system expected (\d+)\./;

const escapeLike = (s: string) => s.replace(/([%_\\])/g, '\\$1');

function eventLabel(m: any): string {
  const tag = m.order_id ? `#${String(m.order_id).slice(0, 8).toUpperCase()}` : '';
  const qty = Math.abs(Number(m.qty_change) || 0);
  const by = m.performed_by_name && !String(m.performed_by_name).startsWith('System') ? m.performed_by_name : null;
  switch (m.event_type) {
    case 'pick': return `${qty} picked (Found) for ${tag || 'an order'}`;
    case 'put_back': return `${qty} back on the shelf from ${tag || 'an order'}`;
    case 'receive': return `${qty} received${by ? ` by ${by}` : ''}`;
    case 'count': return `Counted: ${m.balance_after}${by ? ` by ${by}` : ''}`;
    case 'return': return String(m.reason || 'Customer return');
    default: return String(m.reason || m.event_type || 'Change');
  }
}

export async function getPickerCountFollowUp(
  supabase: SupabaseClient,
  notification: { message?: string; created_at?: string }
): Promise<PickerCountFollowUp | null> {
  const match = String(notification.message || '').match(MESSAGE_RE);
  if (!match) return null;
  const [, productName, pickerName, countedStr, orderTag, expectedStr] = match;
  const notifTime = notification.created_at ? new Date(notification.created_at).getTime() : Date.now();

  // The count row: saved by this picker on this order, just before the bell.
  // Counts before 2026-11 didn't save the picker's name, so match on the order when there is one.
  const reasonLike = orderTag
    ? `%Counted by picker%while picking #${orderTag}%`
    : `%Counted by picker ${escapeLike(pickerName)} while picking%`;
  const { data: counts } = await supabase
    .from('shelf_stock_movements')
    .select('product_id, created_at, balance_after')
    .eq('event_type', 'count')
    .ilike('reason', reasonLike)
    .gte('created_at', new Date(notifTime - 10 * 60 * 1000).toISOString())
    .lte('created_at', new Date(notifTime + 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10);
  if (!counts || counts.length === 0) return null;

  // Several products counted on one order: take the one whose name matches.
  let countRow: any = counts[0];
  if (counts.length > 1) {
    const { data: named } = await supabase.from('products').select('id, name').in('id', counts.map((c: any) => c.product_id));
    const hit = (named || []).find((p: any) => p.name === productName);
    if (hit) countRow = counts.find((c: any) => c.product_id === hit.id) || countRow;
  }
  const productId: string = countRow.product_id;
  const countedAt: string = countRow.created_at;

  const [orderRes, laterRes, shelf, poRes] = await Promise.all([
    orderTag
      ? supabase
          .from('orders')
          .select('id, status')
          .gte('id', `${orderTag.toLowerCase()}-0000-0000-0000-000000000000`)
          .lte('id', `${orderTag.toLowerCase()}-ffff-ffff-ffff-ffffffffffff`)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('shelf_stock_movements')
      .select('created_at, qty_change, balance_after, event_type, order_id, reason, performed_by_name')
      .eq('product_id', productId)
      .gt('created_at', countedAt)
      .order('created_at', { ascending: true })
      .limit(30),
    getShelfForProducts(supabase, [productId]).catch(() => ({} as Record<string, { unallocated: number }>)),
    supabase
      .from('purchase_order_items')
      .select('created_at, expected_qty, received_qty, purchase_orders!inner(notes)')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  // What happened on the order being picked.
  let order: PickerCountFollowUp['order'] = null;
  const o: any = orderRes.data;
  if (o) {
    const [lines, picks, issues] = await Promise.all([
      supabase.from('order_items').select('quantity').eq('order_id', o.id).eq('product_id', productId),
      supabase.from('shelf_stock_order_picks').select('picked_qty').eq('order_id', o.id).eq('product_id', productId),
      supabase.from('order_issues').select('out_of_stock_qty').eq('order_id', o.id).eq('product_id', productId).eq('status', 'open'),
    ]);
    const picked = (picks.data || []).reduce((s: number, r: any) => s + (Number(r.picked_qty) || 0), 0);
    const os = Math.max(0, ...(issues.data || []).map((r: any) => Number(r.out_of_stock_qty) || 1));
    const need = (lines.data || []).reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0) || picked + os;
    order = { id: o.id, shortId: String(o.id).slice(0, 8).toUpperCase(), status: o.status, need, picked, os };
  }

  // Recorded purchases (staff requests are a shopping list, not purchases).
  const buys = (poRes.data || []).filter((r: any) => {
    const po = Array.isArray(r.purchase_orders) ? r.purchase_orders[0] : r.purchase_orders;
    return po?.notes !== 'STAFF_DRAFT';
  });
  const before = buys.find((r: any) => r.created_at <= countedAt);
  const since = buys
    .filter((r: any) => r.created_at > countedAt)
    .reverse()
    .map((r: any) => ({ at: r.created_at, qty: Number(r.expected_qty) || 0, received: Number(r.received_qty) || 0 }));

  return {
    productId,
    productName,
    pickerName,
    counted: Number(countedStr),
    expected: Number(expectedStr),
    countedAt,
    order,
    events: (laterRes.data || []).map((m: any) => ({ at: m.created_at, change: Number(m.qty_change) || 0, label: eventLabel(m) })),
    shelfNow: (shelf as any)[productId]?.unallocated ?? null,
    purchases: {
      lastBeforeCount: before ? { at: before.created_at, qty: Number(before.expected_qty) || 0 } : null,
      sinceCount: since,
    },
  };
}
