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

// Orders in these statuses still hold/claim physical inventory that has not shipped yet.
const UNFULFILLED_STATUSES = [
  'Pending Payment',
  'Processing',
  'Picked',
  'Picked (with issue)',
  'Photo',
  'Packed',
  'For Shipping',
  'For Pick-up',
  'On-Hold',
  'Waiting for Stock'
];

/**
 * Scans the database for stock anomalies and unrecorded movements.
 */
export async function detectInventoryAnomalies(supabase: SupabaseClient): Promise<InventoryAnomaly[]> {
  const anomalies: InventoryAnomaly[] = [];

  // 1. Fetch products with negative stock
  const { data: negativeProducts, error: negErr } = await supabase
    .from('products')
    .select('id, name, sku, variant_name, stock_level')
    .lt('stock_level', 0)
    .limit(100);

  if (negErr) {
    console.error('Error fetching negative stock products:', negErr);
  }

  // 2. Fetch open order issues (picker shortages).
  // Scope strictly to issue_type 'order' — the table also holds 'staff_message',
  // 'purchase_discrepancy', 'direct' (DMs) and 'on_hold' rows that carry a product_id
  // but are NOT floor shortages, and would otherwise be mislabeled as picker reports.
  const { data: openIssues, error: issueErr } = await supabase
    .from('order_issues')
    .select('id, order_id, product_id, out_of_stock_qty, reported_by_name, created_at, products(name, sku, stock_level)')
    .eq('status', 'open')
    .eq('issue_type', 'order')
    .order('created_at', { ascending: false })
    .limit(500);

  if (issueErr) {
    console.error('Error fetching open order issues:', issueErr);
  }

  // 3. Fetch recent memory entries for candidate products
  const candidateIds = Array.from(new Set([
    ...(negativeProducts?.map(p => p.id) || []),
    ...(openIssues?.map((i: any) => i.product_id).filter(Boolean) || [])
  ]));

  const memoryByProduct = await getRecentMemoriesForProducts(supabase, candidateIds);

  // Check negative stock products
  if (negativeProducts && negativeProducts.length > 0) {
    const productIds = negativeProducts.map(p => p.id);

    // Fetch active unfulfilled order items for these products
    const { data: activeItems } = await supabase
      .from('order_items')
      .select('product_id, quantity, is_packed, orders!inner(id, status)')
      .in('product_id', productIds)
      .in('orders.status', UNFULFILLED_STATUSES);

    const activeDemandByProduct = new Map<string, { count: number; qty: number }>();
    (activeItems || []).forEach((item: any) => {
      const cur = activeDemandByProduct.get(item.product_id) || { count: 0, qty: 0 };
      activeDemandByProduct.set(item.product_id, {
        count: cur.count + 1,
        qty: cur.qty + (Number(item.quantity) || 1)
      });
    });

    for (const prod of negativeProducts) {
      const demand = activeDemandByProduct.get(prod.id) || { count: 0, qty: 0 };
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

      // Anomaly: Orders completed, but stock is negative (unrecorded purchase)
      if (demand.count === 0) {
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
          title: `Unrecorded Purchase: ${displayName}`,
          description: `Stock level is currently ${stock}, but you have 0 open unfulfilled orders. Goods were sold and shipped, but the incoming purchase was never recorded in the system.`,
          recommendation: `Confirm the actual shelf count or backfill the unrecorded purchase so your accounting ledger is accurate.`,
          detectedAt: new Date().toISOString(),
          details: {
            shippedWithoutPurchaseQty: Math.abs(stock)
          },
          memoryContext
        });
      } else if (Math.abs(stock) > demand.qty) {
        // Partial unrecorded purchase
        anomalies.push({
          id: `partial-unrecorded-${prod.id}`,
          productId: prod.id,
          productName: displayName,
          sku: prod.sku,
          currentStock: stock,
          unfulfilledOrdersCount: demand.count,
          unfulfilledQty: demand.qty,
          type: 'unrecorded_purchase',
          severity: 'medium',
          title: `Stock Deficit Exceeds Orders: ${displayName}`,
          description: `Stock level is ${stock}, but open orders only account for ${demand.qty} unit(s). The remaining deficit of ${Math.abs(stock) - demand.qty} unit(s) is likely from unrecorded deliveries.`,
          recommendation: `Check physical warehouse shelf count to true up this item.`,
          detectedAt: new Date().toISOString(),
          details: {
            shippedWithoutPurchaseQty: Math.abs(stock) - demand.qty
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

/**
 * Computes today's progress towards the 5-product verification goal.
 */
export async function getGuardianDailyProgress(
  supabase: SupabaseClient,
  totalBacklogCount: number
): Promise<GuardianDailyProgress> {
  const target = 5;
  try {
    // Start of today in Philippine Time (UTC+8)
    const now = new Date();
    const phNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const phDateStr = phNow.toISOString().slice(0, 10);
    const todayMidnightUtc = new Date(`${phDateStr}T00:00:00+08:00`).toISOString();

    const { data: todayMemories, error } = await supabase
      .from('inventory_guardian_memory')
      .select('id, product_id, action_type, physical_count, actor_name, created_at, products(name)')
      .in('action_type', ['physical_count_audit', 'purchase_backfill'])
      .gte('created_at', todayMidnightUtc)
      .order('created_at', { ascending: false });

    if (error || !todayMemories) {
      return {
        target,
        completedToday: 0,
        remainingToday: target,
        isGoalMet: false,
        completedItems: [],
        totalBacklogCount
      };
    }

    // Deduplicate by product_id so if a product was edited twice today it counts once
    const seenProductIds = new Set<string>();
    const completedItems: CompletedDailyAuditItem[] = [];

    for (const m of todayMemories as any[]) {
      if (!m.product_id || seenProductIds.has(m.product_id)) continue;
      seenProductIds.add(m.product_id);
      completedItems.push({
        id: m.id,
        productId: m.product_id,
        productName: m.products?.name || 'Unknown Product',
        actorName: m.actor_name || 'Staff',
        actionType: m.action_type,
        physicalCount: m.physical_count,
        timestamp: m.created_at
      });
    }

    const completedToday = completedItems.length;
    const remainingToday = Math.max(0, target - completedToday);

    return {
      target,
      completedToday,
      remainingToday,
      isGoalMet: completedToday >= target,
      completedItems,
      totalBacklogCount
    };
  } catch (err) {
    console.error('Error fetching guardian daily progress:', err);
    return {
      target,
      completedToday: 0,
      remainingToday: target,
      isGoalMet: false,
      completedItems: [],
      totalBacklogCount
    };
  }
}

export * from './inventory-guardian-action-service';
export * from './inventory-guardian-memory-service';


