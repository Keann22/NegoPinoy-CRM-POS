import { SupabaseClient } from '@supabase/supabase-js';

/*
 * STORED SHELF STOCK (planned, step 1 of the rollout — not used by any screen yet)
 * See architecture.md → "Planned: Stored Shelf Stock and Physical Stock" and
 * docs/BUSINESS_WORKFLOW.md → "Planned: unallocated stock is kept and counted".
 *
 * products.shelf_stock is unallocated stock kept as a number:
 *   + when goods are received or a return arrives back
 *   − only when a picker picks the item (taps Found)
 *   + when picked pieces go back on the shelf (picked order cancelled, picked line removed)
 *   = a shelf count sets it
 * Orders, edits and cancellations of UNPICKED items never change it.
 *
 * Every change goes through the database functions in
 * scripts/migrations/2026-10-30_shelf_stock.sql, which log one
 * shelf_stock_movements row each. Pass a sourceRef that is unique per real-world
 * event (e.g. `pick:<order_item_id>:<log id>`) so a double-tap or retry is applied once.
 * Server only: the functions need the service role.
 */

export type ShelfStockEvent =
  | 'receive'
  | 'return'
  | 'pick'
  | 'put_back'
  | 'correction'
  | 'borrow'
  | 'other';

export interface ShelfStockChange {
  productId: string;
  qty: number; // + adds to the shelf, − takes off
  event: ShelfStockEvent;
  sourceRef?: string;
  orderId?: string;
  orderItemId?: string;
  reason?: string;
  actorName?: string;
}

/** Adds or takes off pieces. Returns the new shelf stock. */
export async function changeShelfStock(supabase: SupabaseClient, c: ShelfStockChange): Promise<number | null> {
  if (!c.qty) return null;
  const { data, error } = await supabase.rpc('change_shelf_stock', {
    p_product_id: c.productId,
    p_qty: Math.round(c.qty),
    p_event: c.event,
    p_source_ref: c.sourceRef ?? null,
    p_order_id: c.orderId ?? null,
    p_order_item_id: c.orderItemId ?? null,
    p_reason: c.reason ?? null,
    p_actor: c.actorName ?? null,
  });
  if (error) throw error;
  return data as number | null;
}

/** Sets shelf stock to a count. Returns the change applied. */
export async function setShelfStock(
  supabase: SupabaseClient,
  productId: string,
  count: number,
  opts: { sourceRef?: string; reason?: string; actorName?: string } = {}
): Promise<number> {
  const { data, error } = await supabase.rpc('set_shelf_stock', {
    p_product_id: productId,
    p_count: Math.round(count),
    p_event: 'count',
    p_source_ref: opts.sourceRef ?? null,
    p_reason: opts.reason ?? null,
    p_actor: opts.actorName ?? null,
  });
  if (error) throw error;
  return Number(data) || 0;
}
