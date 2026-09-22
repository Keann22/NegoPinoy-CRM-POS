import { SupabaseClient } from '@supabase/supabase-js';
import type { ReconciliationItem, ExplainingOrder } from '@/types/supplier.types';

const VOID_STATUSES = ['Cancelled', 'Returned'];

export async function getNegativeStockReconciliationItems(
  supabase: SupabaseClient,
  negativeStockIds: Set<string>,
  productIdsToFetch: Set<string>,
  bundleToComponents: Map<string, { componentId: string; qtyPerBundle: number }[]>
): Promise<ReconciliationItem[]> {
  const reconciliationIds = Array.from(negativeStockIds).filter((id) => !productIdsToFetch.has(id));
  if (reconciliationIds.length === 0) {
    return [];
  }

  const reconciliationIdSet = new Set(reconciliationIds);
  const reconciliationBundleParentIds = Array.from(bundleToComponents.entries())
    .filter(([, comps]) => comps.some((c) => reconciliationIdSet.has(c.componentId)))
    .map(([bundleId]) => bundleId);
  const idsForHistory = Array.from(new Set([...reconciliationIds, ...reconciliationBundleParentIds]));

  const { data: historyRows, error: historyErr } = await supabase
    .from('order_items')
    .select('product_id, orders!inner(id, status, created_at)')
    .in('product_id', idsForHistory);
  if (historyErr) throw historyErr;

  const explainingOrderByProduct = new Map<string, ExplainingOrder>();
  const considerRecord = (productId: string, record: ExplainingOrder) => {
    const existing = explainingOrderByProduct.get(productId);
    if (!existing || new Date(record.createdAt) > new Date(existing.createdAt)) {
      explainingOrderByProduct.set(productId, record);
    }
  };

  historyRows?.forEach((row: any) => {
    if (VOID_STATUSES.includes(row.orders.status)) return;
    const record: ExplainingOrder = {
      shortOrderId: row.orders.id.substring(0, 7).toUpperCase(),
      status: row.orders.status,
      createdAt: row.orders.created_at,
    };
    if (reconciliationIdSet.has(row.product_id)) considerRecord(row.product_id, record);
    bundleToComponents.get(row.product_id)?.forEach((c) => {
      if (reconciliationIdSet.has(c.componentId)) considerRecord(c.componentId, record);
    });
  });

  const { data: reconciliationProducts, error: rpErr } = await supabase
    .from('products')
    .select('id, name, variant_name, stock_level')
    .in('id', reconciliationIds);
  if (rpErr) throw rpErr;

  return (reconciliationProducts || [])
    .map((p: any) => {
      const displayName =
        p.variant_name && !p.name.includes(p.variant_name) ? `${p.name} [${p.variant_name}]` : p.name;
      return {
        productId: p.id,
        productName: displayName,
        currentStock: p.stock_level,
        explainingOrder: explainingOrderByProduct.get(p.id) || null,
      };
    })
    .sort((a, b) => a.currentStock - b.currentStock);
}
