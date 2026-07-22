import { SupabaseClient } from '@supabase/supabase-js';

export const VOID_ORDER_STATUSES = ['Cancelled', 'Returned'];

/**
 * This business runs just-in-time inventory: they buy a product only after a
 * customer orders it, so order_items.cost_price_at_sale gets frozen at 0 (the
 * product's cost is unknown yet) when the order is created. Learning the real
 * cost - whether by recording a purchase up front, or by encoding it after the
 * fact on the Pending Costs screen - is the moment to backfill it onto whichever
 * pending orders were actually waiting on this product: oldest first, only fully
 * covering an order line if the purchased quantity can cover it entirely (a
 * line's cost isn't split across two purchases). Any quantity left over after
 * covering waiting orders was bought ahead of demand - already handled by the
 * initial_unit_cost update the callers do, since future orders snapshot
 * whatever that value is when created.
 *
 * COGS in the P&L is the sum of cost_price_at_sale over order lines, so this is
 * the ONLY path that moves the COGS figure. Writing an expenses row with
 * category 'Cost of Goods Sold' does not - the P&L deliberately excludes that
 * category from operating expenses and never reads it back for COGS.
 */
export async function backfillOrderItemCosts(
  supabase: SupabaseClient,
  productId: string,
  purchasedQty: number,
  cost: number,
): Promise<{ linesUpdated: number; cogsAdded: number }> {
  if (!(cost > 0) || !(purchasedQty > 0)) return { linesUpdated: 0, cogsAdded: 0 };

  const { data: items } = await supabase
    .from('order_items')
    .select('id, quantity, order_id, orders(status, created_at)')
    .eq('product_id', productId)
    .or('cost_price_at_sale.is.null,cost_price_at_sale.eq.0');

  if (!items || items.length === 0) return { linesUpdated: 0, cogsAdded: 0 };

  const waiting = items
    .filter((i: any) => i.orders && !VOID_ORDER_STATUSES.includes(i.orders.status))
    .sort((a: any, b: any) => new Date(a.orders.created_at).getTime() - new Date(b.orders.created_at).getTime());

  let remainingQty = purchasedQty;
  let linesUpdated = 0;
  let cogsAdded = 0;

  for (const item of waiting) {
    if (remainingQty <= 0) break;
    if (item.quantity > remainingQty) continue;

    await supabase
      .from('order_items')
      .update({ cost_price_at_sale: cost })
      .eq('id', item.id);

    remainingQty -= item.quantity;
    linesUpdated += 1;
    cogsAdded += item.quantity * cost;
  }

  return { linesUpdated, cogsAdded };
}
