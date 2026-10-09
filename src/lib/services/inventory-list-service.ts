import { SupabaseClient } from '@supabase/supabase-js';
import { calculateProcurementDemand, fetchAllPages } from './procurement-demand-service';

export interface InventoryListStockInfo {
  unallocatedStock: number;
  unscannedLayawayQty: number;
  isBundle: boolean;
  lastEditedAt: string | null;
  lastEditedBy: string | null;
  manualAdjustmentCount: number;
}

/**
 * Unallocated stock for every product, using the exact same formula as the Procurement
 * Sheet (procurement-dashboard-service.ts) so the two pages always agree and the shared
 * Edit Unallocated Stock dialog round-trips to the number shown here:
 *   unallocated = max(0, max(0, stock_level + unscannedLayaway) - needToBuy)
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
      .select('id, product_id, expected_qty, purchase_orders!inner(notes)')
      .neq('purchase_orders.notes', 'STAFF_DRAFT')
      .eq('status', 'pending_receipt')
      .order('id')
      .range(from, to)
  );

  const { needToBuyMap, unscannedLayawayMap } = await calculateProcurementDemand(
    supabase,
    new Set(products.map((p: any) => p.id)),
    purchased
  );

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
    const unscannedLayawayQty = unscannedLayawayMap.get(p.id) || 0;
    const physicalStock = Math.max(0, (p.stock_level ?? 0) + unscannedLayawayQty);
    const lastEdit = lastEditMap.get(p.id);
    result[p.id] = {
      unallocatedStock: Math.max(0, physicalStock - (needToBuyMap.get(p.id) || 0)),
      unscannedLayawayQty,
      isBundle: Array.isArray(p.assembly_recipe) && p.assembly_recipe.length > 0,
      lastEditedAt: lastEdit ? lastEdit.editedAt : null,
      lastEditedBy: lastEdit ? lastEdit.editedBy : null,
      manualAdjustmentCount: lastEdit ? lastEdit.count : 0,
    };
  }
  return result;
}
