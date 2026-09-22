import { SupabaseClient } from '@supabase/supabase-js';
import type {
  InventoryAnomaly,
  PhysicalCountCorrectionPayload,
  BackfillPurchasePayload,
  BorrowStockPayload,
  GuardianDailyProgress,
  CompletedDailyAuditItem
} from '@/types';
import {
  recordGuardianMemory,
  getRecentMemoriesForProducts,
  getProductGuardianMemory
} from './inventory-guardian-memory-service';

export { getProductGuardianMemory };

import { fetchAllPages } from '../procurement-demand-service';

// Orders in these statuses claim physical inventory still waiting to be picked from the warehouse shelf.
// Statuses where picking has already succeeded ('Picked', 'Photo', 'Packed', 'For Shipping',
// 'For Pick-up') or items where is_packed = true have already been physically pulled from shelf.
const UNPICKED_STATUSES = [
  'Pending Payment',
  'Processing',
  'Waiting for Stock',
  'On-Hold'
];

/**
 * Scans the database for stock anomalies and unrecorded movements.
 */
export async function detectInventoryAnomalies(supabase: SupabaseClient): Promise<InventoryAnomaly[]> {
  const anomalies: InventoryAnomaly[] = [];

  // 1. Fetch all products with negative stock (paginated, no 100-item cutoff)
  const negativeProducts = await fetchAllPages<any>((from, to) =>
    supabase
      .from('products')
      .select('id, name, sku, variant_name, stock_level')
      .lt('stock_level', 0)
      .range(from, to)
  );

  // 2. Fetch open order issues (picker shortages).
  // Scope strictly to issue_type 'order' and status 'open'
  const openIssues = await fetchAllPages<any>((from, to) =>
    supabase
      .from('order_issues')
      .select('id, order_id, product_id, out_of_stock_qty, reported_by_name, created_at, products(name, sku, stock_level)')
      .eq('status', 'open')
      .eq('issue_type', 'order')
      .order('created_at', { ascending: false })
      .range(from, to)
  );

  const openIssueProductIds = (openIssues || [])
    .map((i: any) => i.product_id)
    .filter(Boolean);

  const openIssueKeySet = new Set(
    (openIssues || []).map((i: any) => `${i.order_id}-${i.product_id}`)
  );

  // 3. Fetch bundle products with assembly recipes
  const bundleProducts = await fetchAllPages<any>((from, to) =>
    supabase
      .from('products')
      .select('id, assembly_recipe')
      .neq('assembly_recipe', '[]')
      .range(from, to)
  );

  const bundleToComponents = new Map<string, { componentId: string; qtyPerBundle: number }[]>();
  (bundleProducts || []).forEach((bp: any) => {
    const recipe = Array.isArray(bp.assembly_recipe) ? bp.assembly_recipe : [];
    if (recipe.length === 0) return;
    const components = recipe.map((comp: any) => ({
      componentId: comp.productId || comp.component_id,
      qtyPerBundle: Number(comp.quantity) || 1,
    }));
    bundleToComponents.set(bp.id, components);
  });

  // 4. Determine candidate IDs and fetch recent memory
  const candidateIds = Array.from(new Set([
    ...(negativeProducts?.map(p => p.id) || []),
    ...openIssueProductIds
  ]));

  const memoryByProduct = await getRecentMemoriesForProducts(supabase, candidateIds);

  // 5. Check negative stock products against genuine unpicked demand
  if (negativeProducts && negativeProducts.length > 0) {
    const candidateIdSet = new Set(candidateIds);

    // Also include bundles that consume any candidate component
    const bundleIdsToQuery: string[] = [];
    bundleToComponents.forEach((comps, bId) => {
      if (comps.some(c => candidateIdSet.has(c.componentId))) {
        bundleIdsToQuery.push(bId);
      }
    });

    const allProductIdsToDemand = Array.from(new Set([...candidateIds, ...bundleIdsToQuery]));

    // Fetch active unpicked order items in chunks to avoid URL size limits
    const CHUNK_SIZE = 150;
    const activeDemandRows: any[] = [];

    for (let i = 0; i < allProductIdsToDemand.length; i += CHUNK_SIZE) {
      const chunk = allProductIdsToDemand.slice(i, i + CHUNK_SIZE);
      const chunkRows = await fetchAllPages<any>((from, to) =>
        supabase
          .from('order_items')
          .select('order_id, product_id, quantity, is_packed, orders!inner(id, status, payment_method)')
          .in('product_id', chunk)
          .in('orders.status', [...UNPICKED_STATUSES, 'Picked (with issue)'])
          .range(from, to)
      );
      activeDemandRows.push(...chunkRows);
    }

    const unfulfilledDemandByProduct = new Map<string, { count: number; qty: number }>();

    const recordDemand = (productId: string, qty: number) => {
      const cur = unfulfilledDemandByProduct.get(productId) || { count: 0, qty: 0 };
      unfulfilledDemandByProduct.set(productId, {
        count: cur.count + 1,
        qty: cur.qty + qty
      });
    };

    activeDemandRows.forEach((row: any) => {
      if (row.is_packed) return; // Already physically pulled from shelf and packed
      if (row.orders?.payment_method === 'Lay-away') return; // Consumes allocation, but not unfulfilled shortage

      const orderStatus = row.orders?.status;
      const orderId = row.orders?.id;

      // For 'Picked (with issue)', only count if there is an explicit open shortage issue
      if (orderStatus === 'Picked (with issue)') {
        const hasOpenDirect = openIssueKeySet.has(`${orderId}-${row.product_id}`);
        const comps = bundleToComponents.get(row.product_id);
        const hasOpenComp = comps?.some(c => openIssueKeySet.has(`${orderId}-${c.componentId}`));

        if (!hasOpenDirect && !hasOpenComp) {
          return; // Shortage already resolved or unrelated to this product
        }
      }

      const rowQty = Number(row.quantity) || 1;

      // Direct product demand
      if (candidateIdSet.has(row.product_id)) {
        recordDemand(row.product_id, rowQty);
      }

      // Bundle component demand
      const components = bundleToComponents.get(row.product_id);
      components?.forEach((c) => {
        if (candidateIdSet.has(c.componentId)) {
          recordDemand(c.componentId, rowQty * c.qtyPerBundle);
        }
      });
    });

    for (const prod of negativeProducts) {
      const demand = unfulfilledDemandByProduct.get(prod.id) || { count: 0, qty: 0 };
      const stock = prod.stock_level ?? 0;
      const displayName = prod.variant_name && !prod.name.includes(prod.variant_name)
        ? `${prod.name} [${prod.variant_name}]`
        : prod.name;

      const pMemories = memoryByProduct.get(prod.id) || [];
      const lastAudit = pMemories.find(m => m.actionType === 'physical_count_audit');
      const memoryContext = {
        lastVerifiedCount: lastAudit?.physicalCount,
        lastVerifiedAt: lastAudit?.createdAt,
        lastVerifiedBy: lastAudit?.actorName,
        repeatDiscrepancyCount: pMemories.length
      };

      // Anomaly 1: Stock is negative, but 0 active unpicked orders need it (Ghost Negative Stock)
      if (demand.qty === 0) {
        anomalies.push({
          id: `unrecorded-${prod.id}`,
          productId: prod.id,
          productName: displayName,
          sku: prod.sku,
          currentStock: stock,
          unfulfilledOrdersCount: 0,
          unfulfilledQty: 0,
          type: 'unrecorded_purchase',
          severity: 'high',
          title: `Ghost Negative Stock: ${displayName}`,
          description: `Stock level is currently ${stock}, but you have 0 active unfulfilled orders waiting for this item. All orders have already been packed or completed, but incoming stock was never received in the system.`,
          recommendation: `Confirm physical shelf count to true up this item to 0 or backfill the unrecorded purchase.`,
          detectedAt: new Date().toISOString(),
          details: {
            shippedWithoutPurchaseQty: Math.abs(stock)
          },
          memoryContext
        });
      } else if (Math.abs(stock) > demand.qty) {
        // Anomaly 2: Stock deficit is significantly larger than actual active unpicked orders
        const ghostDeficit = Math.abs(stock) - demand.qty;
        anomalies.push({
          id: `partial-unrecorded-${prod.id}`,
          productId: prod.id,
          productName: displayName,
          sku: prod.sku,
          currentStock: stock,
          unfulfilledOrdersCount: demand.count,
          unfulfilledQty: demand.qty,
          type: 'unrecorded_purchase',
          severity: ghostDeficit >= 5 ? 'high' : 'medium',
          title: `Stock Deficit Exceeds Orders: ${displayName}`,
          description: `Stock level is ${stock}, but active open orders only account for ${demand.qty} unit(s). The remaining deficit of ${ghostDeficit} unit(s) is ghost negative stock from past unrecorded deliveries.`,
          recommendation: `Check physical warehouse shelf count to true up this item so stock matches genuine reservations.`,
          detectedAt: new Date().toISOString(),
          details: {
            shippedWithoutPurchaseQty: ghostDeficit
          },
          memoryContext
        });
      }
    }
  }

  // Check open picker issues
  if (openIssues && openIssues.length > 0) {
    for (const issue of openIssues as any[]) {
      if (!issue.product_id) continue;
      const pName = issue.products?.name || 'Unknown Product';
      const stock = issue.products?.stock_level ?? 0;

      // Deduplicate: only one floor-shortage alert per product, even with multiple open issues
      if (anomalies.some(a => a.productId === issue.product_id && a.type === 'picker_shortage')) {
        continue;
      }

      const pMemories = memoryByProduct.get(issue.product_id) || [];
      const lastAudit = pMemories.find(m => m.actionType === 'physical_count_audit');
      let title = `Floor Shortage Reported: ${pName}`;
      let description = `Picker ${issue.reported_by_name || 'Staff'} reported ${issue.out_of_stock_qty || 1} unit(s) missing for Order #${(issue.order_id || '').slice(0, 8).toUpperCase()}. System ledger currently shows ${stock}.`;
      let recommendation = `Verify if the shelf is truly empty, if it was misplaced, or if stock was borrowed from another room.`;
      let hasConflict = false;

      if (lastAudit && typeof lastAudit.physicalCount === 'number' && lastAudit.physicalCount > 0) {
        const auditDate = new Date(lastAudit.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
        title = `⚠️ Conflict with Verified Memory: ${pName}`;
        description = `Picker reported 0 on shelf, BUT on ${auditDate}, ${lastAudit.actorName || 'Staff'} physically verified ${lastAudit.physicalCount} units on the shelf. Please re-check shelf location before reordering.`;
        recommendation = `Physically verify shelf before purchasing. ${lastAudit.physicalCount} unit(s) were physically verified on ${auditDate}.`;
        hasConflict = true;
      }

      anomalies.push({
        id: `picker-issue-${issue.id}`,
        productId: issue.product_id,
        productName: pName,
        sku: issue.products?.sku,
        currentStock: stock,
        unfulfilledOrdersCount: 1,
        unfulfilledQty: issue.out_of_stock_qty || 1,
        type: 'picker_shortage',
        severity: 'high',
        title,
        description,
        recommendation,
        detectedAt: issue.created_at || new Date().toISOString(),
        details: {
          pickerReportedQty: issue.out_of_stock_qty,
          reportedByName: issue.reported_by_name,
          orderId: issue.order_id
        },
        memoryContext: {
          lastVerifiedCount: lastAudit?.physicalCount,
          lastVerifiedAt: lastAudit?.createdAt,
          lastVerifiedBy: lastAudit?.actorName,
          repeatDiscrepancyCount: pMemories.length,
          hasMemoryConflict: hasConflict
        }
      });
    }
  }

  return anomalies;
}

export {
  computeGuardianDailyTarget,
  getGuardianDailyProgress
} from './inventory-guardian-carryover-service';

export * from './inventory-guardian-action-service';
export * from './inventory-guardian-memory-service';


