import type { SupabaseClient } from '@supabase/supabase-js';
import { paymentEffect, round2 } from './order-payment-rules';
import { notifyOwners } from '@/lib/services/customer-returns/customer-return-service';
import type { ApplyStoreCreditInput, ApplyStoreCreditResult, CustomerCreditInfo } from '@/types/store-credit.types';

export class StoreCreditError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'StoreCreditError';
    this.status = status;
  }
}

interface OrderRow {
  id: string;
  customer_id: string | null;
  status: string;
  balance_due: number | string | null;
  amount_paid: number | string | null;
  total_amount: number | string | null;
  payment_method?: string | null;
}

interface CustomerRow {
  id: string;
  full_name: string | null;
  store_credit: number | string | null;
}

export async function recordStoreCreditEntry(
  supabase: SupabaseClient,
  entry: {
    customerId: string;
    amount: number;
    balanceAfter: number;
    reason: string;
    orderId?: string | null;
    paymentId?: string | null;
    createdByName?: string | null;
  }
): Promise<void> {
  try {
    await supabase.from('store_credit_entries').insert({
      customer_id: entry.customerId,
      amount: entry.amount,
      balance_after: entry.balanceAfter,
      reason: entry.reason,
      order_id: entry.orderId ?? null,
      payment_id: entry.paymentId ?? null,
      created_by_name: entry.createdByName ?? null,
    });
  } catch {
    // Table may not exist yet if SQL migration has not been pasted
  }
}

/** Check if customer has an unverified/Pending payment */
export async function customerHasPendingPayment(
  supabase: SupabaseClient,
  customerId: string
): Promise<boolean> {
  const { data: pending } = await supabase
    .from('payments')
    .select('id, orders!inner(customer_id)')
    .eq('orders.customer_id', customerId)
    .eq('status', 'Pending')
    .limit(1);

  return Boolean(pending && pending.length > 0);
}

/** Get customer store credit and pending payment information */
export async function getCustomerCreditInfo(
  supabase: SupabaseClient,
  orderId: string
): Promise<CustomerCreditInfo> {
  const { data: orderData, error: orderErr } = await supabase
    .from('orders')
    .select('id, customer_id, balance_due, customers(id, full_name, store_credit)')
    .eq('id', orderId)
    .single();

  if (orderErr || !orderData) {
    throw new StoreCreditError('Order not found', 404);
  }

  const customerId = orderData.customer_id;
  if (!customerId) {
    throw new StoreCreditError('Order has no customer linked', 400);
  }

  const customer = orderData.customers as unknown as CustomerRow | null;
  const storeCredit = round2(Number(customer?.store_credit || 0));
  const balanceDue = round2(Math.max(0, Number(orderData.balance_due || 0)));
  const hasPendingPayment = await customerHasPendingPayment(supabase, customerId);

  return {
    customerId,
    customerName: customer?.full_name || 'Customer',
    storeCredit,
    balanceDue,
    hasPendingPayment,
  };
}

/**
 * Apply store credit to an order atomically:
 * 1. Checks amount <= balance_due and amount <= customers.store_credit
 * 2. Optimistically updates customer store credit (.eq('store_credit', creditRead))
 * 3. Optimistically updates order (.eq('amount_paid', paidRead))
 * 4. Inserts payments row (method 'Store Credit', status 'Verified', proof_url null)
 * 5. Logs in order_logs
 * 6. Checks for pending payment (notifies owners if credit came from unverified payment)
 * 7. Triggers paid-check if balance reaches 0
 */
export async function applyStoreCredit(
  supabase: SupabaseClient,
  input: ApplyStoreCreditInput
): Promise<ApplyStoreCreditResult> {
  const { orderId, actorName, note } = input;
  const amount = round2(Number(input.amount || 0));

  if (!orderId) throw new StoreCreditError('Missing order ID', 400);
  if (amount <= 0.009) throw new StoreCreditError('Amount must be greater than 0', 400);

  // 1. Read Order
  const { data: orderData, error: orderErr } = await supabase
    .from('orders')
    .select('id, customer_id, status, balance_due, amount_paid, total_amount, payment_method')
    .eq('id', orderId)
    .single();

  if (orderErr || !orderData) {
    throw new StoreCreditError('Order not found', 404);
  }

  const order = orderData as OrderRow;
  if (order.status === 'Cancelled') {
    throw new StoreCreditError('Cannot apply store credit to a cancelled order', 400);
  }
  if (!order.customer_id) {
    throw new StoreCreditError('Order does not have a linked customer', 400);
  }

  const orderBalance = round2(Math.max(0, Number(order.balance_due || 0)));
  if (amount > orderBalance + 0.009) {
    throw new StoreCreditError(`Amount (₱${amount.toFixed(2)}) exceeds order balance due (₱${orderBalance.toFixed(2)})`, 400);
  }

  // 2. Read Customer
  const { data: custData, error: custErr } = await supabase
    .from('customers')
    .select('id, full_name, store_credit')
    .eq('id', order.customer_id)
    .single();

  if (custErr || !custData) {
    throw new StoreCreditError('Customer not found', 404);
  }

  const customer = custData as CustomerRow;
  const currentCredit = round2(Number(customer.store_credit || 0));
  if (amount > currentCredit + 0.009) {
    throw new StoreCreditError(`Amount (₱${amount.toFixed(2)}) exceeds customer store credit (₱${currentCredit.toFixed(2)})`, 400);
  }

  const newCredit = round2(currentCredit - amount);

  // 3. Optimistic update on Customer
  const { data: updatedCustomer, error: updateCustErr } = await supabase
    .from('customers')
    .update({ store_credit: newCredit })
    .eq('id', order.customer_id)
    .eq('store_credit', customer.store_credit)
    .select('id');

  if (updateCustErr || !updatedCustomer || updatedCustomer.length === 0) {
    throw new StoreCreditError('Customer store credit changed just now. Please try again.', 409);
  }

  // 4. Compute and optimistically update Order
  const effect = paymentEffect(order, amount, 'Store Credit');
  let orderUpdate = supabase
    .from('orders')
    .update({
      amount_paid: effect.newAmountPaid,
      balance_due: effect.newBalanceDue,
      status: effect.newStatus,
    })
    .eq('id', order.id);

  orderUpdate = order.amount_paid === null
    ? orderUpdate.is('amount_paid', null)
    : orderUpdate.eq('amount_paid', Number(order.amount_paid));

  const { data: updatedOrder, error: updateOrderErr } = await orderUpdate.select('id');

  if (updateOrderErr || !updatedOrder || updatedOrder.length === 0) {
    // Rollback customer update
    await supabase.from('customers').update({ store_credit: customer.store_credit }).eq('id', order.customer_id);
    throw new StoreCreditError('Order balance changed just now. Please try again.', 409);
  }

  // 5. Insert payment row
  const notesArr: string[] = [];
  if (note?.trim()) notesArr.push(note.trim());
  notesArr.push(`[Store credit used: ₱${amount.toFixed(2)}, credit left ₱${newCredit.toFixed(2)}]`);
  const fullNotes = notesArr.join('\n');

  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      order_id: order.id,
      payment_date: new Date().toISOString(),
      amount,
      payment_method: 'Store Credit',
      status: 'Verified',
      proof_url: null,
      notes: fullNotes,
    })
    .select('id')
    .single();

  if (payErr || !payment) {
    // Rollback order and customer
    await supabase.from('orders').update({
      amount_paid: order.amount_paid,
      balance_due: order.balance_due,
      status: order.status,
    }).eq('id', order.id);
    await supabase.from('customers').update({ store_credit: customer.store_credit }).eq('id', order.customer_id);
    throw new StoreCreditError(payErr?.message || 'Failed to save payment record', 500);
  }

  // 6. Record order_logs and ledger entry
  await supabase.from('order_logs').insert({
    order_id: order.id,
    status: 'Store credit used',
    user_name: actorName,
    notes: `Applied ₱${amount.toFixed(2)} store credit`,
    snapshot_data: {
      amount,
      creditBefore: currentCredit,
      creditAfter: newCredit,
      paymentId: payment.id,
    },
  });

  await recordStoreCreditEntry(supabase, {
    customerId: order.customer_id,
    amount: -amount,
    balanceAfter: newCredit,
    reason: 'used_on_order',
    orderId: order.id,
    paymentId: payment.id,
    createdByName: actorName,
  });

  // 7. Check for pending payment from this customer (Decision D2)
  const hasPendingSourcePayment = await customerHasPendingPayment(supabase, order.customer_id);
  if (hasPendingSourcePayment) {
    await notifyOwners(
      supabase,
      'Store credit used from unverified payment',
      `₱${amount.toFixed(2)} store credit was used on order #${order.id.slice(0, 7).toUpperCase()}, but customer has an unverified payment. Check Payments to verify.`,
      undefined,
      '/dashboard/accounting/payments'
    ).catch((e) => console.error('notifyOwners error:', e));
  }

  // 8. If fully paid, trigger priority paid check
  if (effect.newBalanceDue <= 0.009) {
    fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/priority/paid-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.id }),
    }).catch(() => {});
  }

  return {
    paymentId: payment.id,
    orderId: order.id,
    amountApplied: amount,
    newBalanceDue: effect.newBalanceDue,
    creditLeft: newCredit,
    newStatus: effect.newStatus,
    hasPendingSourcePayment,
  };
}
