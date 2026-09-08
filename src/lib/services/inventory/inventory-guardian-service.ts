import { SupabaseClient } from '@supabase/supabase-js';
import type {
  InventoryAnomaly,
  PhysicalCountCorrectionPayload,
  BackfillPurchasePayload,
  BorrowStockPayload
} from '@/types';

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
          }
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
          }
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
        title: `Floor Shortage Reported: ${pName}`,
        description: `Picker ${issue.reported_by_name || 'Staff'} reported ${issue.out_of_stock_qty || 1} unit(s) missing for Order #${(issue.order_id || '').slice(0, 8).toUpperCase()}. System ledger currently shows ${stock}.`,
        recommendation: `Verify if the shelf is truly empty, if it was misplaced, or if stock was borrowed from another room.`,
        detectedAt: issue.created_at || new Date().toISOString(),
        details: {
          pickerReportedQty: issue.out_of_stock_qty,
          reportedByName: issue.reported_by_name,
          orderId: issue.order_id
        }
      });
    }
  }

  return anomalies;
}

/**
 * Corrects physical shelf stock using an audited physical count.
 * Handles the calculation between physical count, active reservations, and target stock_level.
 */
export async function applyPhysicalShelfCount(
  supabase: SupabaseClient,
  payload: PhysicalCountCorrectionPayload
): Promise<{ success: boolean; newStockLevel: number; discrepancy: number; activeOrdersCount: number }> {
  const { productId, physicalShelfCount, notes, actorName = 'Inventory Guardian' } = payload;

  // 1. Fetch current product
  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('id, name, stock_level, initial_unit_cost')
    .eq('id', productId)
    .single();

  if (pErr || !product) {
    throw new Error('Product not found for physical count correction');
  }

  // 2. Fetch active unfulfilled orders claiming this product
  const { data: activeItems, error: aErr } = await supabase
    .from('order_items')
    .select('quantity, orders!inner(id, status)')
    .eq('product_id', productId)
    .in('orders.status', UNFULFILLED_STATUSES);

  if (aErr) {
    console.error('Error fetching active orders during physical count:', aErr);
  }

  const activeReservations = (activeItems || []).reduce((sum, item: any) => sum + (Number(item.quantity) || 1), 0);
  const activeOrdersCount = activeItems?.length || 0;

  // 3. In NegoPinoy, stock_level represents: Available (Unreserved) Stock = Physical Count - Active Reservations
  const targetStockLevel = physicalShelfCount - activeReservations;
  const currentStockLevel = product.stock_level ?? 0;
  const discrepancy = targetStockLevel - currentStockLevel;

  // 4. Update product stock_level
  const { error: updErr } = await supabase
    .from('products')
    .update({ stock_level: targetStockLevel })
    .eq('id', productId);

  if (updErr) throw updErr;

  // 5. Log movement
  const auditReason = `Inventory Guardian Audit: Physical shelf count set to ${physicalShelfCount} (Active unfulfilled orders: ${activeReservations}, target stock: ${targetStockLevel}). ${notes || 'Audited by ' + actorName}`;

  await supabase.from('inventory_movements').insert({
    product_id: productId,
    quantity_change: discrepancy,
    movement_type: 'adjustment',
    timestamp: new Date().toISOString(),
    reason: auditReason,
    supplier_name: 'Physical Shelf Audit',
    unit_cost: product.initial_unit_cost || 0
  });

  // 6. If physical stock is now confirmed > 0 and covers open picker issues, auto-resolve them
  if (physicalShelfCount > 0) {
    const { data: openIssues } = await supabase
      .from('order_issues')
      .select('id, order_id')
      .eq('product_id', productId)
      .eq('status', 'open');

    if (openIssues && openIssues.length > 0) {
      await supabase
        .from('order_issues')
        .update({ status: 'resolved' })
        .eq('product_id', productId)
        .eq('status', 'open');
    }
  }

  return {
    success: true,
    newStockLevel: targetStockLevel,
    discrepancy,
    activeOrdersCount
  };
}

/**
 * Backfills an unrecorded purchase directly into inventory and movements.
 */
export async function backfillUnrecordedPurchase(
  supabase: SupabaseClient,
  payload: BackfillPurchasePayload
): Promise<{ success: boolean; newStockLevel: number }> {
  const { productId, quantity, unitCost, supplierName = 'Unrecorded Delivery', purchaseDate, actorName = 'Inventory Guardian' } = payload;

  if (quantity <= 0) {
    throw new Error('Quantity must be greater than 0');
  }

  // 1. Fetch current product
  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('id, name, stock_level')
    .eq('id', productId)
    .single();

  if (pErr || !product) {
    throw new Error('Product not found for purchase backfill');
  }

  const currentStock = product.stock_level ?? 0;
  const newStockLevel = currentStock + quantity;

  // 2. Update stock and initial_unit_cost
  const { error: updErr } = await supabase
    .from('products')
    .update({
      stock_level: newStockLevel,
      ...(unitCost > 0 ? { initial_unit_cost: unitCost } : {})
    })
    .eq('id', productId);

  if (updErr) throw updErr;

  // 3. Log movement
  const dateToUse = purchaseDate || new Date().toISOString();
  await supabase.from('inventory_movements').insert({
    product_id: productId,
    quantity_change: quantity,
    movement_type: 'RESTOCK',
    timestamp: dateToUse,
    reason: `Backfilled Unrecorded Purchase: ${quantity} units @ ₱${unitCost} (${actorName})`,
    supplier_name: supplierName,
    unit_cost: unitCost
  });

  return { success: true, newStockLevel };
}

/**
 * Marks an item as borrowed to fulfill an order, keeping the procurement draft active.
 */
export async function markStockAsBorrowed(
  supabase: SupabaseClient,
  payload: BorrowStockPayload
): Promise<{ success: boolean }> {
  const { productId, quantity, orderId, notes, actorName = 'Staff' } = payload;

  // Log movement explaining the borrow
  await supabase.from('inventory_movements').insert({
    product_id: productId,
    quantity_change: 0, // Zero net stock change; borrowed from outside/staging
    movement_type: 'adjustment',
    timestamp: new Date().toISOString(),
    reason: `Borrowed Stock for Order ${orderId ? '#' + orderId.slice(0, 8) : ''}: ${quantity} units borrowed (${notes || 'Requires replenishment'}). Tagged by ${actorName}`,
    supplier_name: 'Borrowed Stock'
  });

  return { success: true };
}
