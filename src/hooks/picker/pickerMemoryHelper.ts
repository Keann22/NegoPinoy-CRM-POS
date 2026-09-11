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

    for (const mem of (memories || []) as any[]) {
      if (!memoryMap.has(mem.product_id)) {
        memoryMap.set(mem.product_id, {
          actorName: mem.actor_name || 'Staff',
          verifiedCount: mem.verified_physical_stock ?? 0,
          auditedAt: mem.created_at,
          notes: mem.notes || undefined,
          systemStock: rawStockMap.get(mem.product_id)
        });
      }
    }

    // Attach systemStock for products without physical audit memory
    for (const pid of productIds) {
      if (!memoryMap.has(pid) && rawStockMap.has(pid)) {
        memoryMap.set(pid, {
          actorName: '',
          verifiedCount: 0,
          auditedAt: '',
          systemStock: rawStockMap.get(pid)
        });
      }
    }
  } catch (err) {
    console.error('Error in fetchProductMemoriesForPicker:', err);
  }

  return memoryMap;
}
