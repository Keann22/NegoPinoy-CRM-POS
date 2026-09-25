import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductMemoryHint } from './types';

/**
 * Fetches recent verified physical audit memories and attaches ledger stock levels
 * for all products involved in a picked order.
 */
export async function fetchProductMemoriesForPicker(
  supabase: SupabaseClient,
  productIds: string[],
  rawStockMap: Map<string, number>
): Promise<Map<string, ProductMemoryHint>> {
  const memoryMap = new Map<string, ProductMemoryHint>();
  if (productIds.length === 0) return memoryMap;

  try {
    const { data: memories, error } = await supabase
      .from('inventory_guardian_memory')
      .select('product_id, actor_name, verified_physical_stock, created_at, notes')
      .in('product_id', productIds)
      .not('verified_physical_stock', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching inventory guardian memory for picker:', error);
    }

    // Query Unit 2 Reserve Stock for these products
    const u2Map = new Map<string, number>();
    const { data: u2 } = await supabase.from('warehouses').select('id').eq('code', 'UNIT2').maybeSingle();
    if (u2) {
      const { data: u2Rows } = await supabase
        .from('product_warehouse_stock')
        .select('product_id, stock_level')
        .eq('warehouse_id', u2.id)
        .in('product_id', productIds)
        .gt('stock_level', 0);

      if (u2Rows) {
        for (const row of u2Rows) {
          u2Map.set(row.product_id, row.stock_level);
        }
      }
    }

    for (const mem of (memories || []) as any[]) {
      if (!memoryMap.has(mem.product_id)) {
        memoryMap.set(mem.product_id, {
          actorName: mem.actor_name || 'Staff',
          verifiedCount: mem.verified_physical_stock ?? 0,
          auditedAt: mem.created_at,
          notes: mem.notes || undefined,
          systemStock: rawStockMap.get(mem.product_id),
          unit2ReserveStock: u2Map.get(mem.product_id) || 0,
        });
      }
    }

    // Attach systemStock and unit2ReserveStock for products without physical audit memory
    for (const pid of productIds) {
      if (!memoryMap.has(pid) && (rawStockMap.has(pid) || u2Map.has(pid))) {
        memoryMap.set(pid, {
          actorName: '',
          verifiedCount: 0,
          auditedAt: '',
          systemStock: rawStockMap.get(pid),
          unit2ReserveStock: u2Map.get(pid) || 0,
        });
      }
    }
  } catch (err) {
    console.error('Error in fetchProductMemoriesForPicker:', err);
  }

  return memoryMap;
}
