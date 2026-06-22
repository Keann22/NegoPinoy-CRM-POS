
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

  // Trigger OCR in background (fire-and-forget)
  // Note: we'd need paymentId, but since it's a legacy feature we can just pass the proofUrl
  if (proofUrl) {
    fetch('/api/payments/extract-ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proofUrl, orderId }),
    }).catch(err => console.error('OCR trigger failed:', err));
  }

  return orderId;
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

  let totalAmount = subtotal - totalDiscount + insuranceFee;
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

  // -- On-Hold Issue Creation --
  if (finalOrderStatus === 'On-Hold') {
    try {
      const { data: existingIssue } = await supabase
        .from('order_issues')
        .select('id')
        .eq('order_id', context.orderId)
        .eq('status', 'open')
        .limit(1)
        .maybeSingle();

      if (!existingIssue) {
        const { data: newIssue } = await supabase
          .from('order_issues')
          .insert({
            order_id: context.orderId,
            status: 'open',
            reported_by_name: 'System (Auto)'
          })
          .select('id')
          .single();
        
        if (newIssue) {
          await supabase.from('order_issue_messages').insert({
            issue_id: newIssue.id,
            sender_role: 'sales',
            sender_name: 'System',
            message: 'Order was placed On-Hold manually. Please review.'
          });
        }
      }
    } catch (e) {
      console.error("Failed to create issue for On-Hold order:", e);
    }
  }
}

