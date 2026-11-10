import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadProof, type GcashTransferState } from '@/hooks/useGcashTransfer';
import { paymentEffect } from '@/lib/services/payments/order-payment-rules';
import type { Order } from '@/app/dashboard/orders/page';

export interface PaymentFormValues {
  paymentDate: Date;
  amount: number;
  paymentMethod: "Cash" | "GCash" | "Bank Transfer" | "Credit Card" | "Other" | "Shopee Platform Payouts" | "COD Payed" | "Store Credit";
  notes?: string;
  proofOfPayment?: any;
  isTip: boolean;
}

export async function submitStoreCreditPayment(
  orderId: string,
  amount: number,
  notes?: string
): Promise<{ creditLeft: number }> {
  const res = await fetch("/api/payments/store-credit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId,
      amount,
      note: notes,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to apply store credit");
  }

  return { creditLeft: Number(data.creditLeft) };
}

export async function submitTransferPayment(
  supabase: SupabaseClient,
  transfer: GcashTransferState,
  values: PaymentFormValues
): Promise<{ transferCount: number; message: string }> {
  const proofUrl = await uploadProof(supabase, values.proofOfPayment[0]);
  const result = await transfer.save({
    transferAmount: values.amount,
    paymentDate: values.paymentDate.toISOString(),
    paymentMethod: values.paymentMethod,
    notes: values.notes,
    proofUrl,
    isTip: values.isTip,
  });

  fetch('/api/payments/extract-ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proofUrl, paymentId: result.mainPaymentId }),
  }).catch(() => {});

  for (const orderId of result.fullyPaidOrderIds) {
    fetch('/api/priority/paid-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    }).catch(() => {});
  }

  const extraNote = result.storeCredit > 0 ? ` ₱${result.storeCredit.toFixed(2)} went to store credit.`
    : result.tip > 0 ? ` ₱${result.tip.toFixed(2)} kept as a tip.` : '';

  return {
    transferCount: transfer.shares.length,
    message: `₱${values.amount.toFixed(2)} GCash.${extraNote}`,
  };
}

export async function submitStandardPayment(
  supabase: SupabaseClient,
  order: Order,
  values: PaymentFormValues
): Promise<{ overpayment: number }> {
  let proofUrl: string | null = null;
  if (values.proofOfPayment && values.proofOfPayment.length > 0) {
    proofUrl = await uploadProof(supabase, values.proofOfPayment[0]);
  }

  const { data: currentOrderData, error: fetchError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', order.id)
    .single();
      
  if (fetchError || !currentOrderData) {
    throw new Error("Order does not exist!");
  }

  const effect = paymentEffect(currentOrderData, values.amount, values.paymentMethod);
  const { newAmountPaid, newBalanceDue, newStatus } = effect;
  let overpaymentAmount = effect.overpayment;

  let notes = values.notes;
  if (values.isTip && overpaymentAmount > 0) {
    notes = (notes ? notes + "\n" : "") + `[Tip / Keep the change: ₱${overpaymentAmount.toFixed(2)}]`;
    overpaymentAmount = 0;
  }

  const { data: paymentData, error: paymentError } = await supabase
    .from('payments')
    .insert({
      order_id: order.id,
      payment_date: values.paymentDate.toISOString(),
      amount: values.amount,
      payment_method: values.paymentMethod,
      notes,
      proof_url: proofUrl,
    })
    .select()
    .single();

  if (paymentError) throw paymentError;

  if (proofUrl && paymentData?.id) {
    fetch('/api/payments/extract-ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proofUrl, paymentId: paymentData.id })
    }).catch(err => console.error("OCR trigger failed:", err));
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      amount_paid: newAmountPaid,
      balance_due: newBalanceDue,
      status: newStatus,
    })
    .eq('id', order.id);

  if (updateError) throw updateError;
  
  if (overpaymentAmount > 0 && currentOrderData.customer_id) {
    const { data: customerData } = await supabase
      .from('customers')
      .select('store_credit')
      .eq('id', currentOrderData.customer_id)
      .single();
          
    const currentCredit = customerData?.store_credit || 0;
    await supabase
      .from('customers')
      .update({ store_credit: currentCredit + overpaymentAmount })
      .eq('id', currentOrderData.customer_id);
  }
  
  if (newBalanceDue <= 0) {
    fetch('/api/priority/paid-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.id }),
    }).catch(() => {});
  }

  return { overpayment: overpaymentAmount };
}
