import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderFormValues } from '@/lib/schemas/order';
import { computeOrderTotals, saveOrderItemPriceTypes, uploadProofOfPayment } from './order-utils';
import { applyStoreCredit } from '@/lib/services/payments/store-credit-service';

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

  // Order total is the full price of goods + insurance (not lowered by store credit)
  const totalAmount = subtotal - totalDiscount + insuranceFee;
  const balanceDue = totalAmount - actualAmountPaid;

  // Upload proof of payment if present
  let proofUrl: string | null = null;
  if (actualAmountPaid > 0 && values.proofOfPayment && values.proofOfPayment.length > 0) {
    proofUrl = await uploadProofOfPayment(supabase, values.proofOfPayment[0]);
  }

  // Construct payload for RPC: overpayment on create is 0 (handled via Store Credit payment)
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
    overpayment: 0,
  };

  const { data: orderId, error } = await supabase.rpc('process_order_transaction', { payload });
  if (error) throw error;

  await saveOrderItemPriceTypes(supabase, orderId, values.orderItems);

  // If customer asked to apply store credit, apply it as a Store Credit payment
  const storeCreditAvailable = Number(context.selectedCustomerStoreCredit || 0);
  if (values.applyOverpayment && storeCreditAvailable > 0.009) {
    const creditToApply = Math.round(Math.min(storeCreditAvailable, balanceDue) * 100) / 100;
    if (creditToApply > 0) {
      if (typeof window !== 'undefined') {
        const res = await fetch('/api/payments/store-credit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            amount: creditToApply,
            note: 'Store credit applied at order creation',
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('Failed to apply store credit at order creation:', err);
        }
      } else {
        await applyStoreCredit(supabase, {
          orderId,
          amount: creditToApply,
          actorName: context.salesPersonName,
          note: 'Store credit applied at order creation',
        });
      }
    }
  }

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
