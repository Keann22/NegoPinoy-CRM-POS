import { SupabaseClient } from '@supabase/supabase-js';
import type { InventoryGuardianMemoryEntry } from '@/types';

export interface RecordMemoryParams {
  productId: string;
  actionType: 'physical_count_audit' | 'purchase_backfill' | 'borrow_tagged' | 'anomaly_dismissed' | 'anomaly_notified';
  physicalCount?: number | null;
  systemStockBefore?: number | null;
  systemStockAfter?: number | null;
  discrepancy?: number | null;
  activeOrdersCount?: number | null;
  actorName?: string | null;
  actorId?: string | null;
  notes?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Persists an action or physical count to the Guardian's long-term memory.
 */
export async function recordGuardianMemory(
  supabase: SupabaseClient,
  params: RecordMemoryParams
): Promise<void> {
  try {
    await supabase.from('inventory_guardian_memory').insert({
      product_id: params.productId,
      action_type: params.actionType,
      physical_count: params.physicalCount ?? null,
      system_stock_before: params.systemStockBefore ?? null,
      system_stock_after: params.systemStockAfter ?? null,
      discrepancy: params.discrepancy ?? null,
      active_orders_count: params.activeOrdersCount ?? null,
      actor_name: params.actorName ?? 'System',
      actor_id: params.actorId ?? null,
      notes: params.notes ?? null,
      metadata: params.metadata ?? {}
    });
  } catch (err) {
    console.error('Failed to record inventory guardian memory:', err);
  }
}

/**
 * Retrieves the memory timeline for a specific product.
 */
export async function getProductGuardianMemory(
  supabase: SupabaseClient,
  productId: string
): Promise<InventoryGuardianMemoryEntry[]> {
  try {
    const { data, error } = await supabase
      .from('inventory_guardian_memory')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error || !data) return [];

    return data.map((d: any) => ({
      id: d.id,
      productId: d.product_id,
      actionType: d.action_type,
      physicalCount: d.physical_count,
      systemStockBefore: d.system_stock_before,
      systemStockAfter: d.system_stock_after,
      discrepancy: d.discrepancy,
      activeOrdersCount: d.active_orders_count,
      actorName: d.actor_name,
      notes: d.notes,
      metadata: d.metadata,
      createdAt: d.created_at
    }));
  } catch (err) {
    console.error('Failed to fetch product guardian memory:', err);
    return [];
  }
}

/**
 * Fetches recent memories for a batch of candidate products.
 */
export async function getRecentMemoriesForProducts(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Map<string, InventoryGuardianMemoryEntry[]>> {
  const map = new Map<string, InventoryGuardianMemoryEntry[]>();
  if (!productIds || productIds.length === 0) return map;

  try {
    const { data } = await supabase
      .from('inventory_guardian_memory')
      .select('*')
      .in('product_id', productIds)
      .order('created_at', { ascending: false })
      .limit(300);

    (data || []).forEach((d: any) => {
      const list = map.get(d.product_id) || [];
      list.push({
        id: d.id,
        productId: d.product_id,
        actionType: d.action_type,
        physicalCount: d.physical_count,
        systemStockBefore: d.system_stock_before,
        systemStockAfter: d.system_stock_after,
        discrepancy: d.discrepancy,
        activeOrdersCount: d.active_orders_count,
        actorName: d.actor_name,
        notes: d.notes,
        metadata: d.metadata,
        createdAt: d.created_at
      });
      map.set(d.product_id, list);
    });
  } catch (err) {
    console.error('Failed to fetch recent memories for products:', err);
  }

  return map;
}
