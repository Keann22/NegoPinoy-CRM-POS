import { SupabaseClient } from '@supabase/supabase-js';
import type {
  PhysicalCountCorrectionPayload,
  BackfillPurchasePayload,
  BorrowStockPayload
} from '@/types';
import { recordGuardianMemory } from './inventory-guardian-memory-service';
import { getUnpickedQtyForProduct, stockLevelForUnallocated } from './shelf-stock-service';
import { setShelfStock } from './shelf-stock-ledger';

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

  // 2. Units on orders no picker has taken yet, then the LOCKED formula
  // (shelf-stock-service.ts): stock_level = shelf count − unpicked.
  const unpicked = await getUnpickedQtyForProduct(supabase, productId);
  const activeReservations = unpicked.qty;
  const activeOrdersCount = unpicked.orderCount;
  const targetStockLevel = stockLevelForUnallocated(physicalShelfCount, activeReservations);
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

  // 5b. The count is what is on the shelf: set the stored shelf stock to it.
  try {
    await setShelfStock(supabase, productId, physicalShelfCount, {
      reason: `Guardian shelf count: ${physicalShelfCount}. ${notes || ''}`.trim(),
      actorName,
    });
  } catch (e) {
    console.error('Failed to set shelf stock from Guardian count:', e);
  }

  // 6. Stock found on the shelf does NOT close open "not picked" issues: the item is
  // still on the shelf until a picker takes it and taps Found (LOCKED unallocated rule,
  // shelf-stock-service.ts). Closing them here made unpicked pieces count as picked.
  // Instead, tell the picker the stock is there.
  if (physicalShelfCount > 0) {
    const { data: openIssues } = await supabase
      .from('order_issues')
      .select('id')
      .eq('product_id', productId)
      .eq('issue_type', 'order')
      .eq('status', 'open');

    if (openIssues && openIssues.length > 0) {
      await supabase.from('order_issue_messages').insert(
        openIssues.map((i: { id: string }) => ({
          issue_id: i.id,
          sender_role: 'inventory',
          sender_name: actorName,
          message: `Shelf count found ${physicalShelfCount} pc(s) of ${product.name} on the shelf. Not picked yet; please pick and tap Found.`,
        }))
      );
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
