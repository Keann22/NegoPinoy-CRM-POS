import { SupabaseClient } from '@supabase/supabase-js';
import { calculateProcurementDemand, fetchAllPages, getSingleProductProcurementDemand } from './procurement-demand-service';
import { getUnpickedQtyForProduct, getUnpickedQtyMap, unallocatedFromStockLevel } from './inventory/shelf-stock-service';

export interface InventoryListStockInfo {
  unallocatedStock: number;
  unscannedLayawayQty: number;
  isBundle: boolean;
  lastEditedAt: string | null;
  lastEditedBy: string | null;
  manualAdjustmentCount: number;
}

/**
 * Unallocated stock (what is on the shelf) for every product. Uses the LOCKED formula in
 * inventory/shelf-stock-service.ts, the same one the Procurement Sheet and the Edit
 * Unallocated Stock dialog use.
 */
export async function getInventoryListStockInfo(
  supabase: SupabaseClient
): Promise<Record<string, InventoryListStockInfo>> {
  const products = await fetchAllPages<any>((from, to) =>
    supabase
      .from('products')
      .select('id, stock_level, assembly_recipe')
      .not('name', 'ilike', '[DELETED]%')
      .order('id')
      .range(from, to)
  );

  const purchased = await fetchAllPages<any>((from, to) =>
    supabase
      .from('purchase_order_items')
      .select('id, product_id, expected_qty, received_qty, purchase_orders!inner(notes)')
      // Buy-flow POs have notes = null; a plain neq would drop them (SQL null semantics).
      .or('notes.is.null,notes.neq.STAFF_DRAFT', { foreignTable: 'purchase_orders' })
      .eq('status', 'pending_receipt')
      .order('id')
      .range(from, to)
  );

  // Lay-away is only needed for the "+N lay-away" badge; the number itself comes from unpicked.
  const [{ unscannedLayawayMap }, unpickedMap] = await Promise.all([
    calculateProcurementDemand(supabase, new Set(products.map((p: any) => p.id)), purchased),
    getUnpickedQtyMap(supabase),
  ]);

  // Same source as the Procurement Sheet's "last edited" stamp: a person typed a new
  // stock number. A count that matched the system (discrepancy 0) is not an adjustment.
  const memories = await fetchAllPages<any>((from, to) =>
    supabase
      .from('inventory_guardian_memory')
      .select('product_id, actor_name, created_at')
      .eq('action_type', 'physical_count_audit')
      .neq('discrepancy', 0)
      .order('created_at', { ascending: false })
      .range(from, to)
  );

  const lastEditMap = new Map<string, { editedAt: string; editedBy: string; count: number }>();
  for (const m of memories) {
    const existing = lastEditMap.get(m.product_id);
    if (existing) {
      existing.count += 1;
    } else {
      lastEditMap.set(m.product_id, { editedAt: m.created_at, editedBy: m.actor_name || 'Staff', count: 1 });
    }
  }

  const result: Record<string, InventoryListStockInfo> = {};
  for (const p of products) {
    result[p.id] = buildStockInfo(
      p,
      unscannedLayawayMap.get(p.id) || 0,
      unpickedMap.get(p.id) || 0,
      lastEditMap.get(p.id)
    );
  }
  return result;
}

/** Same figure as getInventoryListStockInfo, for one product (e.g. the Products page's Adjust Stock). */
export async function getSingleProductStockInfo(
  supabase: SupabaseClient,
  productId: string
): Promise<InventoryListStockInfo | null> {
  const [{ data: product }, demand, unpicked, { data: memories, count }] = await Promise.all([
    supabase.from('products').select('id, stock_level, assembly_recipe').eq('id', productId).single(),
    getSingleProductProcurementDemand(supabase, productId),
    getUnpickedQtyForProduct(supabase, productId),
    supabase
      .from('inventory_guardian_memory')
      .select('actor_name, created_at', { count: 'exact' })
      .eq('product_id', productId)
      .eq('action_type', 'physical_count_audit')
      .neq('discrepancy', 0)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  if (!product) return null;

  const latest = memories?.[0];
  const lastEdit = latest
    ? { editedAt: latest.created_at, editedBy: latest.actor_name || 'Staff', count: count ?? 1 }
    : undefined;
  return buildStockInfo(product, demand.unscannedLayawayQty, unpicked.qty, lastEdit);
}

function buildStockInfo(
  p: { stock_level: number | null; assembly_recipe: any },
  unscannedLayawayQty: number,
  unpickedQty: number,
  lastEdit: { editedAt: string; editedBy: string; count: number } | undefined
): InventoryListStockInfo {
  return {
    unallocatedStock: unallocatedFromStockLevel(p.stock_level, unpickedQty),
    unscannedLayawayQty,
    isBundle: Array.isArray(p.assembly_recipe) && p.assembly_recipe.length > 0,
    lastEditedAt: lastEdit ? lastEdit.editedAt : null,
    lastEditedBy: lastEdit ? lastEdit.editedBy : null,
    manualAdjustmentCount: lastEdit ? lastEdit.count : 0,
  };
}
