import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderFormValues } from '@/lib/schemas/order';
import { computeOrderTotals, uploadProofOfPayment } from './order-utils';

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
