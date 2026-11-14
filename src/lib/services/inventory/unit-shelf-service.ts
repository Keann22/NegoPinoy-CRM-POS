import { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from '../procurement-demand-service';
import { getUnpickedQtyForProduct, getUnpickedQtyMap, shelfNumberOf } from './shelf-stock-service';

/*
 * Stock per warehouse unit, as shown on screens: what is physically there.
 *
 * Unallocated (shelf) stock is stored once per product (products.shelf_stock).
 * product_warehouse_stock still keeps the old "system stock" per unit: every
 * new order takes its pieces off the 3C (UNIT1) row before anyone picks it, so
 * that row goes negative while the pieces are still on the shelf. The 4A
 * (UNIT2) row is never touched by orders, so it is real pieces.
 *
 *   4A    = recorded 4A stock, never more than the shelf total, never below 0
 *   3C    = shelf total − 4A
 *   total = the shelf number (same as the Procurement Sheet and Inventory List)
 *
 * The old system number (stock_level) is kept as "free to sell".
 */

export interface UnitShelf {
  unit1: number;
  unit2: number;
  total: number;
  freeToSell: number;
}

type ProductStockRow = { id: string; stock_level?: number | null; shelf_stock?: number | null };

/** Splits a shelf total into the two units. */
export function splitShelfByUnit(shelfTotal: number, unit2Recorded: number | null | undefined): { unit1: number; unit2: number } {
  const unit2 = Math.max(0, Math.min(Number(unit2Recorded) || 0, shelfTotal));
  return { unit1: shelfTotal - unit2, unit2 };
}

async function getWarehouseId(supabase: SupabaseClient, code: string): Promise<string | null> {
  const { data } = await supabase.from('warehouses').select('id').eq('code', code).maybeSingle();
  return data?.id ?? null;
}

/** Recorded 4A (UNIT2) stock per product; only rows that aren't 0. */
async function getUnit2Recorded(supabase: SupabaseClient, unit2Id: string, productIds?: string[]): Promise<Map<string, number>> {
  const rows = await fetchAllPages<{ product_id: string; stock_level: number | null }>((from, to) => {
    let q = supabase.from('product_warehouse_stock').select('product_id, stock_level').eq('warehouse_id', unit2Id).neq('stock_level', 0);
    if (productIds) q = q.in('product_id', productIds);
    return q.order('product_id').range(from, to);
  });
  return new Map(rows.map((r) => [r.product_id, Number(r.stock_level) || 0]));
}

/** Unpicked qty, only for products that have no stored shelf number (the formula fallback needs it). */
async function getUnpickedForFallback(supabase: SupabaseClient, products: ProductStockRow[]): Promise<Map<string, number>> {
  const missing = products.filter((p) => p.shelf_stock == null && Number(p.stock_level || 0) !== 0);
  if (missing.length === 0) return new Map();
  if (missing.length > 5) return getUnpickedQtyMap(supabase);
  const out = new Map<string, number>();
  await Promise.all(missing.map(async (p) => out.set(p.id, (await getUnpickedQtyForProduct(supabase, p.id)).qty)));
  return out;
}

/**
 * 3C / 4A / total for each product given. Pass rows with id, stock_level and
 * shelf_stock. unit2Id is optional (looked up when missing).
 */
export async function getUnitShelfForProducts(
  supabase: SupabaseClient,
  products: ProductStockRow[],
  unit2Id?: string | null
): Promise<Map<string, UnitShelf>> {
  const out = new Map<string, UnitShelf>();
  if (products.length === 0) return out;
  const u2Id = unit2Id ?? (await getWarehouseId(supabase, 'UNIT2'));
  const ids = products.map((p) => p.id);
  const [unit2, unpicked] = await Promise.all([
    u2Id ? getUnit2Recorded(supabase, u2Id, ids.length <= 200 ? ids : undefined) : Promise.resolve(new Map<string, number>()),
    getUnpickedForFallback(supabase, products),
  ]);
  for (const p of products) {
    const total = shelfNumberOf(p, unpicked.get(p.id) || 0);
    out.set(p.id, { ...splitShelfByUnit(total, unit2.get(p.id)), total, freeToSell: Number(p.stock_level) || 0 });
  }
  return out;
}

/** Shelf pieces in 3C and 4A over all products (for the Transfers totals cards). */
export async function getUnitShelfTotals(supabase: SupabaseClient, unit2Id?: string | null): Promise<{ unit1: number; unit2: number }> {
  const products = await fetchAllPages<ProductStockRow>((from, to) =>
    supabase.from('products').select('id, stock_level, shelf_stock').not('name', 'ilike', '[DELETED]%').order('id').range(from, to)
  );
  const map = await getUnitShelfForProducts(supabase, products, unit2Id);
  let unit1 = 0;
  let unit2 = 0;
  map.forEach((s) => {
    unit1 += s.unit1;
    unit2 += s.unit2;
  });
  return { unit1, unit2 };
}

/** 3C / 4A / total for one product. */
export async function getUnitShelfForProduct(supabase: SupabaseClient, productId: string): Promise<UnitShelf | null> {
  const { data } = await supabase.from('products').select('id, stock_level, shelf_stock').eq('id', productId).maybeSingle();
  if (!data) return null;
  return (await getUnitShelfForProducts(supabase, [data])).get(productId) ?? null;
}
