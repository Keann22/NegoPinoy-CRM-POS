import type { SupabaseClient } from '@supabase/supabase-js';
import { round2 } from './order-payment-rules';
import { notifyOwners } from '@/lib/services/customer-returns/customer-return-service';
import type { ApplySpxShippingFeeInput, ApplySpxShippingFeeResult } from '@/types/store-credit.types';
import {
  StoreCreditError,
  recordStoreCreditEntry,
  customerHasPendingPayment,
} from './store-credit-service';

interface OrderRow {
  id: string;
  customer_id: string | null;
  status: string;
  balance_due: number | string | null;
  amount_paid: number | string | null;
  total_amount: number | string | null;
  shipping_fee: number | string | null;
  shipping_payment_type: string | null;
}

interface CustomerRow {
  id: string;
  full_name: string | null;
  store_credit: number | string | null;
}

/**
 * Applies SPX shipping fee from customer's store credit.
 * - Sets orders.shipping_fee = existing + fee
 * - Sets orders.total_amount = existing + fee
 * - Sets orders.amount_paid = existing + creditToUse
 * - Sets orders.balance_due = newTotal - newPaid
 * - Sets orders.shipping_payment_type = 'free shipping' (recipient pays ₱0 COD for SF)
 * - Deducts creditToUse from customers.store_credit
 * - Inserts a Verified 'Store Credit' row in payments
 * - Records a row in store_credit_entries (reason: 'spx_sf') and order_logs
 */
export async function applySpxShippingFeeFromStoreCredit(
  supabase: SupabaseClient,
  input: ApplySpxShippingFeeInput
): Promise<ApplySpxShippingFeeResult> {
  const { orderId, actorName, note } = input;
  const shippingFee = round2(Number(input.shippingFee || 0));

  if (!orderId) throw new StoreCreditError('Missing order ID', 400);
  if (shippingFee <= 0.009) throw new StoreCreditError('Shipping fee must be greater than 0', 400);

  // 1. Read Order
  const { data: orderData, error: orderErr } = await supabase
    .from('orders')
    .select('id, customer_id, status, balance_due, amount_paid, total_amount, shipping_fee, shipping_payment_type')
    .eq('id', orderId)
    .single();

  if (orderErr || !orderData) {
    throw new StoreCreditError('Order not found', 404);
  }

  const order = orderData as OrderRow;
  if (order.status === 'Cancelled') {
    throw new StoreCreditError('Cannot add shipping fee to a cancelled order', 400);
  }
  if (!order.customer_id) {
    throw new StoreCreditError('Order does not have a linked customer', 400);
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
  if (currentCredit <= 0.009) {
    throw new StoreCreditError('Customer has no store credit available', 400);
  }

  // Determine credit to use
  const maxUsableCredit = Math.min(shippingFee, currentCredit);
  const creditToUse = input.creditToUse != null
    ? round2(Number(input.creditToUse))
    : maxUsableCredit;

  if (creditToUse <= 0.009) {
    throw new StoreCreditError('Store credit to use must be greater than 0', 400);
  }
  if (creditToUse > currentCredit + 0.009) {
    throw new StoreCreditError(
      `Credit to use (₱${creditToUse.toFixed(2)}) exceeds available credit (₱${currentCredit.toFixed(2)})`,
      400
    );
  }
  if (creditToUse > shippingFee + 0.009) {
    throw new StoreCreditError(
      `Credit to use (₱${creditToUse.toFixed(2)}) exceeds shipping fee (₱${shippingFee.toFixed(2)})`,
      400
    );
  }

  const newCredit = round2(currentCredit - creditToUse);
  const currentShippingFee = round2(Number(order.shipping_fee || 0));
  const newShippingFee = round2(currentShippingFee + shippingFee);

  const currentTotal = round2(Number(order.total_amount || 0));
  const newTotal = round2(currentTotal + shippingFee);

  const currentPaid = round2(Number(order.amount_paid || 0));
  const newPaid = round2(currentPaid + creditToUse);
  const newBalance = round2(Math.max(0, newTotal - newPaid));

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

  // 4. Optimistic update on Order
  let orderUpdate = supabase
    .from('orders')
    .update({
      shipping_fee: newShippingFee,
      total_amount: newTotal,
      amount_paid: newPaid,
      balance_due: newBalance,
      shipping_payment_type: 'free shipping',
    })
    .eq('id', order.id);

  orderUpdate = order.amount_paid === null
    ? orderUpdate.is('amount_paid', null)
    : orderUpdate.eq('amount_paid', Number(order.amount_paid));

  const { data: updatedOrder, error: updateOrderErr } = await orderUpdate.select('id');

  if (updateOrderErr || !updatedOrder || updatedOrder.length === 0) {
    // Rollback customer
    await supabase
      .from('customers')
      .update({ store_credit: customer.store_credit })
      .eq('id', order.customer_id);
    throw new StoreCreditError('Order balance or details changed just now. Please try again.', 409);
  }

  // 5. Insert payment row
  const notesArr: string[] = [];
  if (note?.trim()) notesArr.push(note.trim());
  const unpaidDifference = round2(Math.max(0, shippingFee - creditToUse));
  notesArr.push(
    `[SPX Shipping Fee covered by Store Credit: ₱${creditToUse.toFixed(2)}${
      unpaidDifference > 0.009 ? ` (Total SF: ₱${shippingFee.toFixed(2)}, ₱${unpaidDifference.toFixed(2)} added to balance)` : ''
    }, credit left ₱${newCredit.toFixed(2)}]`
  );
  const fullNotes = notesArr.join('\n');

  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      order_id: order.id,
      payment_date: new Date().toISOString(),
      amount: creditToUse,
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
      shipping_fee: order.shipping_fee,
      total_amount: order.total_amount,
      amount_paid: order.amount_paid,
      balance_due: order.balance_due,
      shipping_payment_type: order.shipping_payment_type,
    }).eq('id', order.id);
    await supabase.from('customers').update({ store_credit: customer.store_credit }).eq('id', order.customer_id);
    throw new StoreCreditError(payErr?.message || 'Failed to save payment record', 500);
  }

  // 6. Record order_logs and ledger entry
  await supabase.from('order_logs').insert({
    order_id: order.id,
    status: 'SPX Shipping Fee paid via Store Credit',
    user_name: actorName,
    notes: `Added SPX shipping fee ₱${shippingFee.toFixed(2)} (₱${creditToUse.toFixed(2)} from store credit). Marked shipping as Free Shipping.`,
    snapshot_data: {
      shippingFee,
      creditUsed: creditToUse,
      creditBefore: currentCredit,
      creditAfter: newCredit,
      totalBefore: currentTotal,
      totalAfter: newTotal,
      paymentId: payment.id,
    },
  });

  await recordStoreCreditEntry(supabase, {
    customerId: order.customer_id,
    amount: -creditToUse,
    balanceAfter: newCredit,
    reason: 'spx_sf',
    orderId: order.id,
    paymentId: payment.id,
    createdByName: actorName,
  });

  // 7. Check for pending payment from this customer (Decision D2)
  const hasPendingSourcePayment = await customerHasPendingPayment(supabase, order.customer_id);
  if (hasPendingSourcePayment) {
    await notifyOwners(
      supabase,
      'Store credit used for SPX SF from unverified payment',
      `₱${creditToUse.toFixed(2)} store credit was used for SPX shipping on order #${order.id.slice(0, 7).toUpperCase()}, but customer has an unverified payment.`,
      undefined,
      '/dashboard/accounting/payments'
    ).catch((e) => console.error('notifyOwners error:', e));
  }

  return {
    paymentId: payment.id,
    orderId: order.id,
    shippingFee,
    creditUsed: creditToUse,
    newTotal,
    newBalanceDue: newBalance,
    creditLeft: newCredit,
    remainingFeeToPay: unpaidDifference,
  };
}
