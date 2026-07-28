
/**
 * order-service.ts
 * Pure business-logic functions for creating and editing orders.
 *
 * These have no React dependencies — they accept a Supabase client + data,
 * perform all DB operations, and return results or throw errors.
 * The calling component (OrderDialog) handles UI feedback (toast, navigation).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderFormValues } from '@/lib/schemas/order';
import {
  STATUSES_THAT_CLEAR_ORDER_ISSUES,
  resolveOpenOrderIssues,
  resolveOrderIssuesForRemovedProducts,
  createOnHoldIssue
} from './order-issues-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Computes subtotal, totalDiscount, and insuranceFee from order items. */
function computeOrderTotals(
  items: OrderFormValues['orderItems'],
  includeInsurance: boolean
) {
  const { subtotal, totalDiscount } = items.reduce(
    (acc, item) => {
      acc.subtotal += (item.sellingPriceAtSale || 0) * (item.quantity || 0);
      acc.totalDiscount += (item.discount || 0) * (item.quantity || 0);
      return acc;
    },
    { subtotal: 0, totalDiscount: 0 }
  );
  const insuranceFee = includeInsurance ? (subtotal - totalDiscount) * 0.01 : 0;
  return { subtotal, totalDiscount, insuranceFee };
}

/** Uploads a proof-of-payment file to Supabase Storage and returns the public URL. */
async function uploadProofOfPayment(
  supabase: SupabaseClient,
  file: File
): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('proof_of_payment')
    .upload(fileName, file, { upsert: false });
  if (uploadError) throw uploadError;
  const { data: { publicUrl } } = supabase.storage.from('proof_of_payment').getPublicUrl(uploadData.path);
  return publicUrl;
}

// ---------------------------------------------------------------------------
// createOrder
// ---------------------------------------------------------------------------

export interface CreateOrderContext {
  userId: string;
  salesPersonId: string;
  salesPersonName: string;
  selectedCustomerStoreCredit?: number;
  selectedCustomerId?: string;
}

/**
 * Creates a new order, inserts payments, adjusts inventory, and returns the new order ID.
 * Throws on any error — the caller is responsible for handling toast/navigation.
 */
export async function createOrder(
  supabase: SupabaseClient,
  values: OrderFormValues,
  context: CreateOrderContext
): Promise<string> {
  const { subtotal, totalDiscount, insuranceFee } = computeOrderTotals(
    values.orderItems,
    values.includeInsurance ?? true
  );

  let actualAmountPaid = values.amountPaid ?? 0;
  if (values.isDownpaymentCOD && (values.paymentType === 'Installment' || values.paymentType === 'Lay-away')) {
    actualAmountPaid = 0;
  }

  const rawTotal = subtotal - totalDiscount + insuranceFee;
  const overpaymentApplied =
    values.applyOverpayment && context.selectedCustomerStoreCredit
      ? Math.min(context.selectedCustomerStoreCredit, rawTotal)
      : 0;
  const totalAmount = rawTotal - overpaymentApplied;
  const balanceDue = totalAmount - actualAmountPaid;

  // Upload proof of payment if present
  let proofUrl: string | null = null;
  if (actualAmountPaid > 0 && values.proofOfPayment && values.proofOfPayment.length > 0) {
    proofUrl = await uploadProofOfPayment(supabase, values.proofOfPayment[0]);
  }

  // Construct payload for RPC
  const payload = {
    isEdit: false,
    customerId: values.customerId,
    orderStatus: values.orderStatus,
    totalAmount,
    paymentType: values.paymentType,
    shippingDetails: values.shippingDetails,
    installmentMonths: values.paymentType === 'Installment' ? values.installmentMonths : null,
    monthlyPayment: values.paymentType === 'Installment' ? values.monthlyPayment : null,
    orderDate: values.orderDate.toISOString(),
    subtotal,
    totalDiscount,
    insuranceFee,
    balanceDue,
    salesPersonId: context.salesPersonId,
    salesPersonName: context.salesPersonName,
    platformFees: values.platformFees,
    trackingNumber: values.trackingNumber,
    amountPaid: actualAmountPaid,
    proofUrl,
    orderItems: values.orderItems,
    overpayment: overpaymentApplied
  };

  const { data: orderId, error } = await supabase.rpc('process_order_transaction', { payload });
  if (error) throw error;

  // Trigger OCR in background (fire-and-forget). The RPC inserts the payment row
  // server-side and only returns the order id, so look up the payment id it created.
  if (proofUrl) {
    (async () => {
      const { data: payment } = await supabase
        .from('payments')
        .select('id')
        .eq('order_id', orderId)
        .eq('proof_url', proofUrl)
        .limit(1)
        .maybeSingle();
      if (!payment) return;
      await fetch('/api/payments/extract-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofUrl, paymentId: payment.id }),
      });
    })().catch((err: unknown) => console.error('OCR trigger failed:', err));
  }

  return orderId;
}

// ---------------------------------------------------------------------------
// Cancellation stock effects
// ---------------------------------------------------------------------------

/**
 * Applies a stock delta for every item on an order, exploding bundle products
 * onto their components exactly the way process_order_transaction does at sale
 * time. `sign` is +1 to restore stock (cancel) or -1 to re-deduct (un-cancel).
 *
 * A bundle carries no real stock of its own — a sale decrements its components,
 * so the reversal must decrement/restore those same components. Touching the
 * bundle's own product_id here (the old behaviour) was asymmetric with creation
 * and left bundle SKUs drifting into phantom negative stock, which then leaked
 * onto the procurement sheet as an un-buyable line. Always expand via the
 * product's *current* assembly_recipe, matching the RPC's own edit-reversal path.
 */
async function applyOrderStockDelta(
  supabase: SupabaseClient,
  orderId: string,
  sign: 1 | -1,
  reason: string
): Promise<void> {
  const { data: items, error } = await supabase
    .from('order_items')
    .select('product_id, quantity')
    .eq('order_id', orderId);
  if (error) throw error;
  if (!items || items.length === 0) return;

  const productIds = Array.from(new Set(items.map(i => i.product_id)));
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, name, assembly_recipe')
    .in('id', productIds);
  if (prodErr) throw prodErr;

  const recipeMap = new Map(
    (products || []).map(p => [p.id, { name: p.name, recipe: Array.isArray(p.assembly_recipe) ? p.assembly_recipe : [] }])
  );

  const applyOne = async (productId: string, qtyChange: number, movementReason: string) => {
    const { error: rpcError } = await supabase.rpc('increment_stock', {
      p_product_id: productId,
      qty: qtyChange,
      new_unit_cost: 0,
    });
    if (rpcError) throw rpcError;
    await supabase.from('inventory_movements').insert({
      product_id: productId,
      quantity_change: qtyChange,
      movement_type: 'adjustment',
      reason: movementReason,
    });
  };

  for (const item of items) {
    const entry = recipeMap.get(item.product_id);
    const recipe = entry?.recipe || [];
    if (recipe.length > 0) {
      for (const comp of recipe) {
        const componentId = comp.productId || comp.component_id;
        if (!componentId) continue;
        const compQty = sign * item.quantity * (comp.quantity || 1);
        await applyOne(componentId, compQty, `${reason} (Bundle: ${entry?.name || item.product_id})`);
      }
    } else {
      await applyOne(item.product_id, sign * item.quantity, reason);
    }
  }
}

/**
 * Restores stock for every item on an order that is being cancelled.
 * Stock is deducted immediately at order creation (see createOrder above), so
 * cancelling must reverse that deduction or the item is permanently lost from stock.
 */
export async function restoreStockForCancelledOrder(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  await applyOrderStockDelta(supabase, orderId, 1, `Order Cancelled: #${orderId}`);
}

/** Symmetric reversal for when a Cancelled order is moved back to an active status. */
export async function deductStockForUncancelledOrder(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  await applyOrderStockDelta(supabase, orderId, -1, `Order Un-cancelled: #${orderId}`);
}


// ---------------------------------------------------------------------------
// editOrder
// ---------------------------------------------------------------------------

export interface EditOrderContext {
  userProfileId: string;
  userProfileName: string;
  orderId: string;
  originalOrderDate: string;
  originalAmountPaid: number;
  originalOrderItems: Array<{
    productId: string;
    productName: string;
    quantity: number;
    costPriceAtSale: number;
    sellingPriceAtSale: number;
  }>;
}

/**
 * Edits an existing order: reverts old inventory, re-applies new inventory, updates order record.
 * Throws on any error — caller handles toast/reload.
 */
export async function editOrder(
  supabase: SupabaseClient,
  values: OrderFormValues,
  context: EditOrderContext
): Promise<void> {
  const { subtotal, totalDiscount, insuranceFee } = computeOrderTotals(
    values.orderItems,
    values.includeInsurance ?? true
  );

  let actualAmountPaid = context.originalAmountPaid;
  if ((values.amountPaid ?? 0) > actualAmountPaid) {
    actualAmountPaid = values.amountPaid ?? 0;
  }

  const totalAmount = subtotal - totalDiscount + insuranceFee;
  let balanceDue = totalAmount - actualAmountPaid;
  let overpayment = 0;

  if (balanceDue < 0) {
    overpayment = Math.abs(balanceDue);
    balanceDue = 0;
  }

  let finalOrderStatus = values.orderStatus;
  // Auto-correct status if they previously logged a COD payment but then edited the order to Full Payment
  if (balanceDue <= 0 && values.paymentType === 'Full Payment' && finalOrderStatus === 'Payment Received (COD)') {
    finalOrderStatus = 'Completed';
  }

  const wasOldOrder = new Date(context.originalOrderDate) < new Date('2026-06-01T00:00:00+08:00');

  // Construct payload for RPC
  const payload = {
    isEdit: true,
    orderId: context.orderId,
    wasOldOrder,
    originalOrderItems: context.originalOrderItems,
    customerId: values.customerId,
    orderStatus: finalOrderStatus,
    totalAmount,
    paymentType: values.paymentType,
    shippingDetails: values.shippingDetails,
    installmentMonths: values.paymentType === 'Installment' ? values.installmentMonths : null,
    monthlyPayment: values.paymentType === 'Installment' ? values.monthlyPayment : null,
    orderDate: values.orderDate.toISOString(),
    subtotal,
    totalDiscount,
    insuranceFee,
    balanceDue,
    salesPersonId: context.userProfileId, // Note: using profile ID for recorded_by
    salesPersonName: null, // Doesn't need to be updated on edit
    platformFees: values.platformFees,
    trackingNumber: values.trackingNumber,
    amountPaid: actualAmountPaid,
    proofUrl: null, // Not updating proof on edit
    orderItems: values.orderItems,
    overpayment: overpayment
  };

  const { error } = await supabase.rpc('process_order_transaction', { payload });
  if (error) throw error;

  // -- Auto-deduct from Procurement Sheet --
  const oldMap = new Map<string, number>();
  for (const item of context.originalOrderItems) {
    oldMap.set(item.productId, (oldMap.get(item.productId) || 0) + item.quantity);
  }
  const newMap = new Map<string, number>();
  for (const item of values.orderItems) {
    newMap.set(item.productId, (newMap.get(item.productId) || 0) + item.quantity);
  }

  const deductions: { productId: string; deductQty: number }[] = [];
  for (const [productId, oldQty] of Array.from(oldMap.entries())) {
    const newQty = newMap.get(productId) || 0;
    if (newQty < oldQty) {
      deductions.push({ productId, deductQty: oldQty - newQty });
    }
  }

  if (deductions.length > 0) {
    try {
      const { data: draftPo } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('notes', 'STAFF_DRAFT')
        .eq('status', 'pending_receipt')
        .limit(1)
        .maybeSingle();

      if (draftPo) {
        for (const deduction of deductions) {
          const { data: item } = await supabase
            .from('purchase_order_items')
            .select('id, expected_qty')
            .eq('po_id', draftPo.id)
            .eq('product_id', deduction.productId)
            .limit(1)
            .maybeSingle();

          if (item) {
            const newExpectedQty = item.expected_qty - deduction.deductQty;
            if (newExpectedQty <= 0) {
              await supabase.from('purchase_order_items').delete().eq('id', item.id);
            } else {
              await supabase.from('purchase_order_items').update({ expected_qty: newExpectedQty }).eq('id', item.id);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to deduct from procurement:", e);
    }
  }

  // Log the edit
  try {
    await supabase.from('order_logs').insert({
      order_id: context.orderId,
      status: 'Order Edited',
      user_name: context.userProfileName
    });
  } catch (e) {
    console.error("Failed to log order edit:", e);
  }

  // -- Auto-resolve issues for removed products --
  try {
    const remainingProductIds = values.orderItems.map(i => i.productId);
    await resolveOrderIssuesForRemovedProducts(supabase, context.orderId, remainingProductIds);
  } catch (e) {
    console.error("Failed to auto-resolve issues for removed products:", e);
  }

  // -- Auto-resolve ALL issues if status clears them --
  if (STATUSES_THAT_CLEAR_ORDER_ISSUES.includes(finalOrderStatus)) {
    try {
      await resolveOpenOrderIssues(supabase, context.orderId);
    } catch(e) {
      console.error("Failed to resolve open issues on edit:", e);
    }
  }

  if (finalOrderStatus === 'On-Hold') {
    try {
      await createOnHoldIssue(supabase, context.orderId);
    } catch (e) {
      console.error("Failed to create issue for On-Hold order:", e);
    }
  }
}

