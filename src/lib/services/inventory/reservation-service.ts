import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from '../procurement-demand-service';
import { PICKED_WITH_ISSUE, UNPICKED_STATUSES } from './shelf-stock-service';

/*
 * Stock reserved for replacements (owner, 2026-11-03; docs/BUSINESS_WORKFLOW.md
 * "Reserved for a replacement").
 *
 * Sales marks an order "Reserved for replacement" on the Priority List (event
 * kind 'reserve'; 'reserve_cleared' removes it). Until that order has picked
 * its items, those pieces are spoken for:
 *   - the Picker blocks Found on another order when the shelf can't cover both
 *     (owners can override with a reason)
 *   - Receiving shows who the arriving pieces are for
 * What an order still needs: unpicked lines while it isn't picked yet, or its
 * open OS qty once it is "Picked (with issue)". After it is picked, nothing.
 */

const EVENTS_TABLE = 'order_priority_events';

export interface ReservedOrder {
  orderId: string;
  shortId: string;
  customerName: string;
  note: string | null;
  byName: string | null;
  qty: number;
}

export interface ProductReservation {
  qty: number;
  orders: ReservedOrder[];
}

/** Orders whose latest reserve* event is 'reserve', with the note and who did it. */
async function activeReservations(supabase: SupabaseClient) {
  const rows = await fetchAllPages<any>((f, t) =>
    supabase.from(EVENTS_TABLE).select('order_id, kind, note, created_by_name, created_at')
      .in('kind', ['reserve', 'reserve_cleared']).order('id').range(f, t));
  const latest = new Map<string, any>();
  rows.forEach((r) => {
    const prev = latest.get(r.order_id);
    if (!prev || String(r.created_at) > String(prev.created_at)) latest.set(r.order_id, r);
  });
  return Array.from(latest.values()).filter((r) => r.kind === 'reserve');
}

/**
 * Pieces reserved per product, optionally only for these products and leaving
 * out one order (the order being picked can use its own reservation).
 * Never throws: if anything fails, nothing is reserved (the warehouse keeps working).
 */
export async function getReservations(
  supabase: SupabaseClient,
  opts: { productIds?: string[]; excludeOrderId?: string | null } = {}
): Promise<Map<string, ProductReservation>> {
  const out = new Map<string, ProductReservation>();
  try {
    const reserved = (await activeReservations(supabase)).filter((r) => r.order_id !== opts.excludeOrderId);
    if (reserved.length === 0) return out;
    const ids = reserved.map((r) => r.order_id);
    const want = opts.productIds ? new Set(opts.productIds) : null;

    const [{ data: orders }, { data: lines }, { data: issues }] = await Promise.all([
      supabase.from('orders').select('id, status, customers(full_name)').in('id', ids),
      supabase.from('order_items').select('order_id, product_id, quantity, is_packed').in('order_id', ids),
      supabase.from('order_issues').select('order_id, product_id, out_of_stock_qty')
        .in('order_id', ids).eq('status', 'open').eq('issue_type', 'order'),
    ]);
    const eventById = new Map(reserved.map((r) => [r.order_id, r]));

    for (const o of orders || []) {
      const needed = new Map<string, number>();
      if (UNPICKED_STATUSES.includes(o.status)) {
        (lines || []).filter((l: any) => l.order_id === o.id && !l.is_packed && l.product_id)
          .forEach((l: any) => needed.set(l.product_id, (needed.get(l.product_id) || 0) + (Number(l.quantity) || 0)));
      } else if (o.status === PICKED_WITH_ISSUE) {
        // Same rule as the shelf formula: per product, the largest open OS qty.
        (issues || []).filter((i: any) => i.order_id === o.id && i.product_id)
          .forEach((i: any) => needed.set(i.product_id, Math.max(needed.get(i.product_id) || 0, Number(i.out_of_stock_qty) || 1)));
      }
      const ev = eventById.get(o.id);
      needed.forEach((qty, productId) => {
        if (qty <= 0 || (want && !want.has(productId))) return;
        const cur = out.get(productId) || { qty: 0, orders: [] };
        cur.qty += qty;
        cur.orders.push({
          orderId: o.id,
          shortId: o.id.slice(0, 7).toUpperCase(),
          customerName: (o as any).customers?.full_name || 'Customer',
          note: ev?.note || null,
          byName: ev?.created_by_name || null,
          qty,
        });
        out.set(productId, cur);
      });
    }
  } catch (e) {
    console.error('getReservations failed:', e instanceof Error ? e.message : e);
  }
  return out;
}

/** Plain object for JSON responses. */
export function reservationsToJson(map: Map<string, ProductReservation>): Record<string, ProductReservation> {
  return Object.fromEntries(map.entries());
}

/**
 * An owner gave a reserved piece to another order: written on each reserved
 * order's trail and told to whoever reserved it.
 */
export async function logReservationOverride(
  supabase: SupabaseClient,
  input: { productName: string; toOrderId: string; reason: string; byName: string; reserved: ReservedOrder[] }
) {
  const to = input.toOrderId.slice(0, 7).toUpperCase();
  for (const r of input.reserved) {
    await supabase.from('order_logs').insert({
      order_id: r.orderId,
      status: 'Reservation overridden',
      user_name: input.byName,
      snapshot_data: { productName: input.productName, toOrderId: input.toOrderId, reason: input.reason },
    });
    if (r.byName && r.byName.trim().toLowerCase() !== input.byName.trim().toLowerCase()) {
      await supabase.from('notifications').insert({
        sales_person_name: r.byName,
        title: `Reserved ${input.productName} given to another order`,
        message: `${input.byName} gave it to #${to}: “${input.reason}”. Your replacement #${r.shortId} (${r.customerName}) still waits for it.`.slice(0, 240),
        link: '/dashboard/priority',
        is_read: false,
      });
    }
  }
}
