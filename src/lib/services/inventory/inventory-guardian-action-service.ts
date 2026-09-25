import { SupabaseClient } from '@supabase/supabase-js';
import type {
  PhysicalCountCorrectionPayload,
  BackfillPurchasePayload,
  BorrowStockPayload
} from '@/types';
import { recordGuardianMemory } from './inventory-guardian-memory-service';

// Statuses that claim physical inventory still waiting to be picked from the warehouse shelf.
// Statuses where picking has already succeeded ('Picked', 'Photo', 'Packed', 'For Shipping',
// 'For Pick-up', etc.) or items where is_packed = true have already been physically removed
// from the shelf and secured into parcels/bins. Subtracting them from a physical shelf count
// causes a severe double-deduction.
const UNPICKED_STATUSES = [
  'Pending Payment',
  'Processing',
  'Waiting for Stock',
  'On-Hold'
];

/**
 * Corrects physical shelf stock using an audited physical count.
 * Handles the calculation between physical count, active reservations, and target stock_level.
 */
export async function applyPhysicalShelfCount(
  supabase: SupabaseClient,
  payload: PhysicalCountCorrectionPayload
): Promise<{ success: boolean; newStockLevel: number; discrepancy: number; activeOrdersCount: number }> {
  const { productId, physicalShelfCount, notes, actorName = 'Inventory Guardian', actorId } = payload;

  // 1. Fetch current product
  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('id, name, stock_level, initial_unit_cost')
    .eq('id', productId)
    .single();

  if (pErr || !product) {
    throw new Error('Product not found for physical count correction');
  }

  // 2. Fetch active unpicked orders claiming this product from the shelf
  const { data: activeItems, error: aErr } = await supabase
    .from('order_items')
    .select('order_id, quantity, is_packed, orders!inner(id, status)')
    .eq('product_id', productId)
    .in('orders.status', [...UNPICKED_STATUSES, 'Picked (with issue)']);

  if (aErr) {
    console.error('Error fetching active orders during physical count:', aErr);
  }

  // Check open shortage issues for 'Picked (with issue)' orders
  const { data: openIssues } = await supabase
    .from('order_issues')
    .select('order_id, out_of_stock_qty')
    .eq('product_id', productId)
    .eq('status', 'open');

  const openIssueMap = new Map<string, number>();
  (openIssues || []).forEach((i: any) => {
    openIssueMap.set(i.order_id, Number(i.out_of_stock_qty) || 1);
  });

  let activeReservations = 0;
  let activeOrdersCount = 0;

  for (const item of (activeItems || [])) {
    const order = Array.isArray(item.orders) ? item.orders[0] : item.orders;
    if (!order || typeof order !== 'object') continue;
    const orderStatus = 'status' in order ? String(order.status) : '';
    const orderId = 'id' in order ? String(order.id) : '';

    if (orderStatus === 'Picked (with issue)') {
      // Only count if this specific product has an open out-of-stock issue
      if (openIssueMap.has(orderId)) {
        const shortQty = openIssueMap.get(orderId)!;
        activeReservations += shortQty;
        activeOrdersCount++;
      }
    } else if (item.is_packed) {
      continue; // Already physically pulled from shelf and packed
    } else if (UNPICKED_STATUSES.includes(orderStatus)) {
      activeReservations += (Number(item.quantity) || 1);
      activeOrdersCount++;
    }
  }

  // 3. In NegoPinoy, stock_level represents: Available (Unreserved) Stock = Physical Count - Active Unpicked Reservations
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

  // 7. Record to Guardian Memory
  await recordGuardianMemory(supabase, {
    productId,
    actionType: 'physical_count_audit',
    physicalCount: physicalShelfCount,
    systemStockBefore: currentStockLevel,
    systemStockAfter: targetStockLevel,
    discrepancy,
    activeOrdersCount,
    actorName,
    actorId,
    notes: notes || 'Physical count verified'
  });

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
  const { productId, quantity, unitCost, supplierName = 'Unrecorded Delivery', purchaseDate, actorName = 'Inventory Guardian', actorId } = payload;

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

  // 4. Record to Guardian Memory
  await recordGuardianMemory(supabase, {
    productId,
    actionType: 'purchase_backfill',
    physicalCount: null,
    systemStockBefore: currentStock,
    systemStockAfter: newStockLevel,
    discrepancy: quantity,
    actorName,
    actorId,
    notes: `Purchased ${quantity} units @ ₱${unitCost} from ${supplierName}`
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
  const { productId, quantity, orderId, notes, actorName = 'Staff', actorId } = payload;

  // Log movement explaining the borrow
  await supabase.from('inventory_movements').insert({
    product_id: productId,
    quantity_change: 0, // Zero net stock change; borrowed from outside/staging
    movement_type: 'adjustment',
    timestamp: new Date().toISOString(),
    reason: `Borrowed Stock for Order ${orderId ? '#' + orderId.slice(0, 8) : ''}: ${quantity} units borrowed (${notes || 'Requires replenishment'}). Tagged by ${actorName}`,
    supplier_name: 'Borrowed Stock'
  });

  // Record to Guardian Memory
  await recordGuardianMemory(supabase, {
    productId,
    actionType: 'borrow_tagged',
    actorName,
    actorId,
    notes: notes || 'Borrowed stock for order',
    metadata: { orderId, quantity }
  });

  return { success: true };
}
