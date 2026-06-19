
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

/** Applies or reverts inventory for a list of order items (handles bundles). */
async function applyInventoryChanges(
  supabase: SupabaseClient,
  orderItems: Array<{ productId: string; productName: string; quantity: number; sellingPriceAtSale: number; costPriceAtSale: number; discount?: number }>,
  orderId: string,
  isOldOrder: boolean,
  direction: 1 | -1, // -1 = deduct (sale), +1 = revert (edit reversal)
  reasonPrefix: string
): Promise<Map<string, number>> {
  const productIds = orderItems.map(i => i.productId);
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, stock_level, initial_unit_cost, name, assembly_recipe')
    .in('id', productIds);
  if (productsError) throw productsError;

  const productMap = new Map((products || []).map(p => [p.id, p]));
  const unitCostMap = new Map<string, number>();

  // Collect all component IDs for bundles
  const componentIds = new Set<string>();
  (products || []).forEach(p => {
    if (p.assembly_recipe && Array.isArray(p.assembly_recipe)) {
      p.assembly_recipe.forEach((comp: any) => componentIds.add(comp.productId));
    }
  });

  const componentMap = new Map<string, any>();
  if (componentIds.size > 0) {
    const { data: components, error: compError } = await supabase
      .from('products')
      .select('id, stock_level, initial_unit_cost, name')
      .in('id', Array.from(componentIds));
    if (compError) throw compError;
    (components || []).forEach(c => componentMap.set(c.id, c));
  }

  for (const item of orderItems) {
    const product = productMap.get(item.productId);
    if (!product) throw new Error(`Product "${item.productName}" not found.`);

    let unitCost = product.initial_unit_cost || 0;

    if (product.assembly_recipe && Array.isArray(product.assembly_recipe) && product.assembly_recipe.length > 0) {
      // Bundle: deduct/revert each component
      unitCost = 0;
      for (const comp of product.assembly_recipe) {
        const compData = componentMap.get(comp.productId);
        if (!compData) throw new Error(`Component "${comp.productName}" not found for bundle "${product.name}".`);

        unitCost += (compData.initial_unit_cost || 0) * comp.quantity;

        if (!isOldOrder) {
          const qty = direction * item.quantity * comp.quantity;
          const { error: rpcError } = await supabase.rpc('increment_stock', {
            p_product_id: comp.productId,
            qty,
          });
          if (rpcError) throw rpcError;
          compData.stock_level = (compData.stock_level || 0) + qty;

          const { error: movErr } = await supabase.from('inventory_movements').insert({
            product_id: comp.productId,
            quantity_change: qty,
            movement_type: direction === -1 ? 'sale' : 'adjustment',
            timestamp: new Date().toISOString(),
            reason: `${reasonPrefix} ${orderId} (Bundle: ${product.name})`,
            unit_cost: compData.initial_unit_cost || 0,
          });
          if (movErr) throw movErr;
        }
      }
    } else {
      // Standard product
      if (!isOldOrder) {
        const qty = direction * item.quantity;
        const { error: rpcError } = await supabase.rpc('increment_stock', {
          p_product_id: item.productId,
          qty,
        });
        if (rpcError) throw rpcError;
        product.stock_level = (product.stock_level || 0) + qty;

        const { error: movErr } = await supabase.from('inventory_movements').insert({
          product_id: item.productId,
          quantity_change: qty,
          movement_type: direction === -1 ? 'sale' : 'adjustment',
          timestamp: new Date().toISOString(),
          reason: `${reasonPrefix} ${orderId}`,
          unit_cost: unitCost,
        });
        if (movErr) throw movErr;
      }
    }

    unitCostMap.set(item.productId, unitCost);
  }

  return unitCostMap;
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

  const { installmentMonths, monthlyPayment, proofOfPayment } = values;

  // 0. Upload proof of payment if present
  let proofUrl: string | null = null;
  if (actualAmountPaid > 0 && proofOfPayment && proofOfPayment.length > 0) {
    proofUrl = await uploadProofOfPayment(supabase, proofOfPayment[0]);
  }

  // 1. Insert order record
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .insert({
      customer_id: values.customerId,
      status: values.orderStatus,
      total_amount: totalAmount,
      payment_method: values.paymentType,
      notes: values.shippingDetails,
      installment_months: values.paymentType === 'Installment' ? installmentMonths : null,
      monthly_payment: values.paymentType === 'Installment' ? monthlyPayment : null,
      order_date: values.orderDate.toISOString(),
      subtotal,
      total_discount: totalDiscount,
      insurance_fee: insuranceFee,
      balance_due: balanceDue,
      sales_person_id: context.salesPersonId,
      sales_person_name: context.salesPersonName,
      platform_fees: values.platformFees,
      tracking_number: values.trackingNumber,
      amount_paid: actualAmountPaid,
    })
    .select()
    .single();

  if (orderError) throw orderError;
  const newOrderId = orderData.id;

  // 2. Insert initial payment record
  if (actualAmountPaid > 0) {
    const { data: paymentData, error: paymentError } = await supabase
      .from('payments')
      .insert({
        order_id: newOrderId,
        payment_date: values.orderDate.toISOString(),
        amount: actualAmountPaid,
        payment_method: values.paymentType === 'Full Payment' ? 'Full Payment' : 'Downpayment',
        proof_url: proofUrl,
        notes: 'Initial Order Payment',
      })
      .select()
      .single();

    if (paymentError) throw paymentError;

    // Trigger OCR in background (fire-and-forget)
    if (proofUrl && paymentData?.id) {
      fetch('/api/payments/extract-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofUrl, paymentId: paymentData.id }),
      }).catch(err => console.error('OCR trigger failed:', err));
    }
  }

  // 3. Apply inventory changes
  const isOldOrder = values.orderDate < new Date('2026-06-01T00:00:00+08:00');
  const unitCostMap = await applyInventoryChanges(
    supabase,
    values.orderItems,
    newOrderId,
    isOldOrder,
    -1,
    'Order'
  );

  // 4. Insert order items
  for (const item of values.orderItems) {
    const { error: itemError } = await supabase.from('order_items').insert({
      order_id: newOrderId,
      product_id: item.productId,
      product_name: item.productName,
      quantity: item.quantity,
      unit_price: item.sellingPriceAtSale,
      cost_price_at_sale: unitCostMap.get(item.productId) ?? 0,
      selling_price_at_sale: item.sellingPriceAtSale,
      discount: item.discount || 0,
    });
    if (itemError) throw itemError;
  }

  // 5. Deduct store credit if overpayment was applied
  if (overpaymentApplied > 0 && context.selectedCustomerId) {
    const { error: creditError } = await supabase
      .from('customers')
      .update({ store_credit: (context.selectedCustomerStoreCredit ?? 0) - overpaymentApplied })
      .eq('id', context.selectedCustomerId);
    if (creditError) throw creditError;
  }

  return newOrderId;
}

// ---------------------------------------------------------------------------
// editOrder
// ---------------------------------------------------------------------------

export interface EditOrderContext {
  userProfileId: string;
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

  const { installmentMonths, monthlyPayment } = values;
  const wasOldOrder = new Date(context.originalOrderDate) < new Date('2026-06-01T00:00:00+08:00');
  const isOldOrder = values.orderDate < new Date('2026-06-01T00:00:00+08:00');

  // 1. Revert old inventory (add stock back)
  if (!wasOldOrder) {
    await applyInventoryChanges(
      supabase,
      context.originalOrderItems,
      context.orderId,
      true, // wasOldOrder=false so this applies; passing isOldOrder=false to force changes
      1,
      'Order Edit Reversal for'
    );
  }

  // 2. Delete old order items
  await supabase.from('order_items').delete().eq('order_id', context.orderId);

  // 3. Apply new inventory
  const unitCostMap = await applyInventoryChanges(
    supabase,
    values.orderItems,
    context.orderId,
    isOldOrder,
    -1,
    'Order Edited'
  );

  // 4. Re-insert order items
  for (const item of values.orderItems) {
    const { error: itemError } = await supabase.from('order_items').insert({
      order_id: context.orderId,
      product_id: item.productId,
      product_name: item.productName,
      quantity: item.quantity,
      unit_price: item.sellingPriceAtSale,
      cost_price_at_sale: unitCostMap.get(item.productId) ?? 0,
      selling_price_at_sale: item.sellingPriceAtSale,
      discount: item.discount || 0,
    });
    if (itemError) throw itemError;
  }

  // 5. Update order record
  const { error: updateError } = await supabase.from('orders').update({
    customer_id: values.customerId,
    status: values.orderStatus,
    total_amount: totalAmount,
    payment_method: values.paymentType,
    notes: values.shippingDetails,
    installment_months: values.paymentType === 'Installment' ? installmentMonths : null,
    monthly_payment: values.paymentType === 'Installment' ? monthlyPayment : null,
    subtotal,
    total_discount: totalDiscount,
    insurance_fee: insuranceFee,
    balance_due: balanceDue,
    tracking_number: values.trackingNumber,
    amount_paid: actualAmountPaid,
  }).eq('id', context.orderId);
  if (updateError) throw updateError;

  // 6. Handle overpayment → store credit
  if (overpayment > 0) {
    const { data: customer } = await supabase
      .from('customers')
      .select('store_credit')
      .eq('id', values.customerId)
      .single();

    const currentCredit = customer?.store_credit || 0;
    const newCredit = currentCredit + overpayment;

    await supabase.from('customers').update({ store_credit: newCredit }).eq('id', values.customerId);

    await supabase.from('accounting_expenses').insert({
      date: new Date().toISOString(),
      category: 'Customer Store Credit Liability',
      amount: overpayment,
      description: `Overpayment from edited order ${context.orderId} converted to store credit`,
      recorded_by: context.userProfileId,
    });
  }
}
