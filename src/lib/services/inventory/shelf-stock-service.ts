import { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from '../procurement-demand-service';

/*
 * ============================================================================
 * UNALLOCATED STOCK — LOCKED FORMULA. DO NOT CHANGE.
 * Owner decision, 2026-10-30. See architecture.md → "Unallocated stock = what is
 * on the shelf (LOCKED)".
 * ============================================================================
 *
 * Unallocated stock is what is physically on the shelf right now, ready to pick.
 * A sales order does NOT lower it. It goes down only when a picker marks the
 * item Found, because only then has the item left the shelf.
 *
 *   unallocated = max(0, stock_level + unpicked)
 *
 * stock_level already has every open order taken off (stock is deducted when
 * the order is created), so adding back the units no picker has taken yet gives
 * the shelf.
 *
 * "Unpicked" =
 *   - lines on orders in Pending Payment / Processing / Waiting for Stock / On-Hold
 *     (all payment types, lay-away included), skipping is_packed lines;
 *   - plus, on Picked (with issue) orders, the qty the picker marked OS
 *     (open order_issues.out_of_stock_qty), once per order and product;
 *   - bundle lines count as qty × recipe qty of each component (bundles hold no stock).
 *
 * Every screen that shows unallocated stock and every edit that writes it must
 * go through this file.
 *
 * SINCE 2026-11-13 (owner approved after the 2-week trial): screens show the
 * STORED shelf number, products.shelf_stock, through shelfNumberOf(). It is kept
 * by the database (+ receive/return, − pick, + put back, = count; see
 * architecture.md "Stored Shelf Stock"). The meaning above is unchanged; the
 * formula is now only the fallback for products with no stored number yet
 * (bundles, products never received) and the nightly drift check.
 */

export const UNPICKED_STATUSES = ['Pending Payment', 'Processing', 'Waiting for Stock', 'On-Hold'];
export const PICKED_WITH_ISSUE = 'Picked (with issue)';

/** The locked formula: shelf stock from stock_level and the unpicked qty. */
export function unallocatedFromStockLevel(stockLevel: number | null | undefined, unpickedQty: number): number {
  return Math.max(0, (stockLevel ?? 0) + unpickedQty);
}

/**
 * What every screen shows as unallocated (on the shelf, ready to pick): the
 * stored shelf number, never below 0. A negative stored number means more was
 * picked than the system had; it shows as 0 like the formula did. Falls back to
 * the formula when the product has no stored number (shelf_stock is null).
 */
export function shelfNumberOf(
  product: { shelf_stock?: number | null; stock_level?: number | null },
  unpickedQty: number
): number {
  if (product.shelf_stock != null) return Math.max(0, Number(product.shelf_stock));
  return unallocatedFromStockLevel(product.stock_level, unpickedQty);
}

/** The same formula backwards: the stock_level that makes unallocated equal a shelf count. */
export function stockLevelForUnallocated(unallocated: number, unpickedQty: number): number {
  return Math.round(unallocated - unpickedQty);
}

type RecipeComponent = { componentId: string; qtyPerBundle: number };

function parseRecipe(recipe: unknown): RecipeComponent[] {
  if (!Array.isArray(recipe)) return [];
  return recipe
    .map((c: any) => ({ componentId: c?.productId || c?.component_id, qtyPerBundle: Number(c?.quantity) || 1 }))
    .filter((c): c is RecipeComponent => typeof c.componentId === 'string' && c.componentId.length > 0);
}

function orderStatusOf(row: any): string {
  const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
  return order && typeof order === 'object' && 'status' in order ? String(order.status) : '';
}

/** Adds the OS qty of open issues on Picked (with issue) orders, once per order + product. */
function addOpenShortages(issues: any[], add: (productId: string, qty: number) => void) {
  const maxByKey = new Map<string, { productId: string; qty: number }>();
  for (const i of issues) {
    if (orderStatusOf(i) !== PICKED_WITH_ISSUE || !i.product_id) continue;
    const key = `${i.order_id}-${i.product_id}`;
    const qty = Number(i.out_of_stock_qty) || 1;
    const cur = maxByKey.get(key);
    if (!cur || qty > cur.qty) maxByKey.set(key, { productId: i.product_id, qty });
  }
  maxByKey.forEach(({ productId, qty }) => add(productId, qty));
}

/** Unpicked qty for every product (one pass over all open, unpicked order lines). */
export async function getUnpickedQtyMap(supabase: SupabaseClient): Promise<Map<string, number>> {
  const [bundles, lines, issues] = await Promise.all([
    fetchAllPages<any>((from, to) =>
      supabase.from('products').select('id, assembly_recipe').neq('assembly_recipe', '[]').order('id').range(from, to)
    ),
    fetchAllPages<any>((from, to) =>
      supabase
        .from('order_items')
        .select('id, product_id, quantity, is_packed, orders!inner(status)')
        .in('orders.status', UNPICKED_STATUSES)
        .order('id')
        .range(from, to)
    ),
    fetchAllPages<any>((from, to) =>
      supabase
        .from('order_issues')
        .select('id, order_id, product_id, out_of_stock_qty, orders!inner(status)')
        .eq('status', 'open')
        .not('product_id', 'is', null)
        .eq('orders.status', PICKED_WITH_ISSUE)
        .order('id')
        .range(from, to)
    ),
  ]);

  const recipes = new Map<string, RecipeComponent[]>();
  for (const b of bundles) {
    const comps = parseRecipe(b.assembly_recipe);
    if (comps.length > 0) recipes.set(b.id, comps);
  }

  const unpicked = new Map<string, number>();
  const add = (productId: string, qty: number) => unpicked.set(productId, (unpicked.get(productId) || 0) + qty);

  for (const row of lines) {
    if (row.is_packed) continue;
    const qty = Number(row.quantity) || 1;
    const comps = recipes.get(row.product_id);
    if (comps) comps.forEach((c) => add(c.componentId, qty * c.qtyPerBundle));
    else add(row.product_id, qty);
  }
  addOpenShortages(issues, add);
  return unpicked;
}

/** The product itself (1) plus every bundle that contains it, with how many of it each bundle uses. */
export async function bundleQtyPerUnit(supabase: SupabaseClient, productId: string): Promise<Map<string, number>> {
  const qtyPerUnit = new Map<string, number>([[productId, 1]]);
  for (const key of ['productId', 'component_id']) {
    const { data: bundles, error } = await supabase
      .from('products')
      .select('id, assembly_recipe')
      // jsonb containment needs a JSON string; supabase-js turns a JS array into a Postgres array literal
      .contains('assembly_recipe', JSON.stringify([{ [key]: productId }]));
    if (error) throw error;
    for (const b of bundles || []) {
      const comp = parseRecipe(b.assembly_recipe).find((c) => c.componentId === productId);
      if (comp) qtyPerUnit.set(b.id, comp.qtyPerBundle);
    }
  }
  return qtyPerUnit;
}

/** Unpicked qty for one product, plus how many orders it comes from. */
export async function getUnpickedQtyForProduct(
  supabase: SupabaseClient,
  productId: string
): Promise<{ qty: number; orderCount: number }> {
  const qtyPerUnit = await bundleQtyPerUnit(supabase, productId);

  const [linesRes, issuesRes] = await Promise.all([
    supabase
      .from('order_items')
      .select('order_id, product_id, quantity, is_packed, orders!inner(status)')
      .in('product_id', Array.from(qtyPerUnit.keys()))
      .in('orders.status', UNPICKED_STATUSES),
    supabase
      .from('order_issues')
      .select('order_id, product_id, out_of_stock_qty, orders!inner(status)')
      .eq('product_id', productId)
      .eq('status', 'open')
      .eq('orders.status', PICKED_WITH_ISSUE),
  ]);
  if (linesRes.error) throw linesRes.error;
  if (issuesRes.error) throw issuesRes.error;

  let qty = 0;
  const orders = new Set<string>();
  for (const row of linesRes.data || []) {
    if (row.is_packed) continue;
    qty += (Number(row.quantity) || 1) * (qtyPerUnit.get(row.product_id) || 1);
    orders.add(String(row.order_id));
  }
  addOpenShortages(issuesRes.data || [], (_id, q) => (qty += q));
  (issuesRes.data || []).forEach((i: any) => orders.add(String(i.order_id)));
  return { qty, orderCount: orders.size };
}
