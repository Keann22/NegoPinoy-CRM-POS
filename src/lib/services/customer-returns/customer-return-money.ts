import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CR_REFUND_METHODS,
  REFUND_EXPENSE_CATEGORY,
  REFUND_VOIDED_SALE_EXPENSE_CATEGORY,
} from '@/types/customer-returns.types';
import { CustomerReturnError, logEvent, notifyNames, outcomeCanRunNow, setOrderStatus, shortOrder } from './customer-return-service';

/*
 * Customer Returns phase 2: the steps that touch orders and money.
 *   replacement order -> a ₱0 order made with process_order_transaction (same
 *                        function as New Order), so stock, picker and the
 *                        Priority List treat it like any order
 *   refund sent       -> an expenses row ('Customer Refund'; a full refund uses
 *                        its own category that P&L skips, because the sale of a
 *                        Returned order is already out of P&L)
 *   credit given      -> added to customers.store_credit (New Order offers it)
 *
 * Each one first "claims" the case with an update guarded on updated_at, so a
 * double tap can't make two orders or two expenses.
 */

const SHIPPING_TYPE = { us: 'free shipping', customer: 'sf only' } as const;

async function claim(supabase: SupabaseClient, r: any, patch: Record<string, unknown> = {}): Promise<string> {
  const stamp = new Date().toISOString();
  const { data, error } = await supabase
    .from('customer_returns')
    .update({ ...patch, updated_at: stamp })
    .eq('id', r.id)
    .eq('updated_at', r.updated_at)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new CustomerReturnError('Someone else just changed this case. Refresh and try again.');
  return stamp;
}

/** Makes the ₱0 replacement order and links it to the case. */
export async function createReplacementOrder(
  supabase: SupabaseClient,
  r: any,
  wanted: { id: string; qty: number }[],
  actorName: string,
  note?: string
): Promise<string> {
  if (r.replacement_order_id) throw new CustomerReturnError('A replacement order was already made for this case.');
  const items: any[] = r.customer_return_items || [];
  if (r.outcome === 'replacement') {
    if (r.outcome_done_at) throw new CustomerReturnError('Already done.');
    if (!outcomeCanRunNow(r)) throw new CustomerReturnError('Wait for the item to arrive and be checked first.');
  } else if (r.outcome === 'reship') {
    // A re-ship can't send the damaged pieces; they get a replacement order of their own.
    if (!r.checked_at || !items.some((i) => i.damaged_qty > 0)) throw new CustomerReturnError('Nothing damaged to replace on this re-ship.');
  } else {
    throw new CustomerReturnError('The owners did not decide on a replacement for this case.');
  }

  const byId = new Map(wanted.map((w) => [w.id, Math.round(Number(w.qty) || 0)]));
  const lines = items
    .map((i) => ({ item: i, qty: byId.get(i.id) ?? 0 }))
    .filter((l) => l.qty > 0 && l.item.product_id);
  if (lines.length === 0) throw new CustomerReturnError('Enter how many pieces to send.');
  for (const l of lines) {
    if (l.qty > l.item.qty) throw new CustomerReturnError(`${l.item.product_name}: at most ${l.item.qty}.`);
  }

  const { data: orig, error: oErr } = await supabase
    .from('orders')
    .select('customer_id, sales_person_id, sales_person_name, shipping_name, shipping_phone, shipping_address, delivery_instructions')
    .eq('id', r.order_id)
    .single();
  if (oErr || !orig) throw new CustomerReturnError('Original order not found.');

  await claim(supabase, r);

  const payer = r.shipping_payer as 'us' | 'customer' | null;
  const notes = [
    `Replacement for return #${r.case_no} (order #${shortOrder(r.order_id)}).`,
    payer === 'us' ? 'Shipping: FREE, we pay.' : payer === 'customer' ? 'Shipping: customer pays (SF only).' : '',
    note?.trim() || '',
  ].filter(Boolean).join(' ');

  const payload = {
    isEdit: false,
    customerId: orig.customer_id,
    orderStatus: 'Processing',
    totalAmount: 0,
    paymentType: 'Full Payment',
    shippingDetails: notes,
    installmentMonths: null,
    monthlyPayment: null,
    orderDate: new Date().toISOString(),
    subtotal: 0,
    totalDiscount: 0,
    insuranceFee: 0,
    balanceDue: 0,
    salesPersonId: orig.sales_person_id,
    salesPersonName: orig.sales_person_name,
    platformFees: 0,
    trackingNumber: null,
    amountPaid: 0,
    proofUrl: null,
    orderItems: lines.map((l) => ({
      productId: l.item.product_id,
      productName: l.item.product_name,
      quantity: l.qty,
      costPriceAtSale: 0,
      sellingPriceAtSale: 0,
      discount: 0,
    })),
    overpayment: 0,
  };
  const { data: newOrderId, error } = await supabase.rpc('process_order_transaction', { payload });
  if (error) throw error;
  const orderId = String(newOrderId);

  // Same address as the original; the shipping dialog starts from this payer.
  await supabase.from('orders').update({
    shipping_name: orig.shipping_name,
    shipping_phone: orig.shipping_phone,
    shipping_address: orig.shipping_address,
    delivery_instructions: orig.delivery_instructions,
    shipping_payment_type: payer ? SHIPPING_TYPE[payer] : null,
  }).eq('id', orderId);
  await supabase.from('order_items').update({
    price_type: 'custom',
    price_override_reason: `Replacement for return #${r.case_no}`,
    price_override_by: actorName,
  }).eq('order_id', orderId);
  await supabase.from('order_logs').insert({ order_id: orderId, status: 'Processing', user_name: actorName });

  const now = new Date().toISOString();
  await supabase.from('customer_returns').update({
    replacement_order_id: orderId,
    ...(r.outcome === 'replacement'
      ? { outcome_done_at: now, outcome_done_by_name: actorName, outcome_done_note: `Replacement order #${shortOrder(orderId)}` }
      : {}),
    updated_at: now,
  }).eq('id', r.id);

  const pieces = lines.map((l) => `${l.qty}× ${l.item.product_name}`).join(', ');
  await logEvent(supabase, r.id, 'replacement_order', actorName, `#${shortOrder(orderId)}: ${pieces}`);
  const agent = orig.sales_person_name;
  if (agent && agent.trim().toLowerCase() !== actorName.trim().toLowerCase()) {
    await notifyNames(supabase, [agent], `Return #${r.case_no}: replacement order made`,
      `Order #${shortOrder(orderId)} (₱0) for ${pieces}. It goes to the picker like any order.`);
  }
  return orderId;
}

/** Owners: the refund was paid. Logged as an expense so Cash Flow and P&L see it. */
export async function recordRefund(
  supabase: SupabaseClient,
  r: any,
  input: { amount: number; method: string; reference?: string; note?: string },
  actorName: string
) {
  if (!['full_refund', 'partial_refund'].includes(r.outcome)) throw new CustomerReturnError('The owners did not decide on a refund for this case.');
  if (r.outcome_done_at) throw new CustomerReturnError('Already done.');
  if (!outcomeCanRunNow(r)) throw new CustomerReturnError('Wait for the item to arrive and be checked first.');
  const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
  if (!(amount > 0)) throw new CustomerReturnError('Enter the amount refunded.');
  if (!(CR_REFUND_METHODS as readonly string[]).includes(input.method)) throw new CustomerReturnError('Pick how it was paid.');

  const now = new Date().toISOString();
  const reference = input.reference?.trim() || null;
  await claim(supabase, r, {
    outcome_done_at: now, outcome_done_by_name: actorName, outcome_done_note: input.note?.trim() || null,
    refund_method: input.method, refund_reference: reference, amount,
  });

  const customer = r.orders?.customers?.full_name || 'Customer';
  const { data: expense, error } = await supabase.from('expenses').insert({
    expense_date: now,
    category: r.outcome === 'full_refund' ? REFUND_VOIDED_SALE_EXPENSE_CATEGORY : REFUND_EXPENSE_CATEGORY,
    amount,
    description: `Return #${r.case_no} · order #${shortOrder(r.order_id)} · ${customer} · ${input.method}${reference ? ` ref ${reference}` : ''}`,
  }).select('id').single();
  if (error) {
    // Undo the claim so it can be tried again.
    await supabase.from('customer_returns').update({ outcome_done_at: null, outcome_done_by_name: null, updated_at: new Date().toISOString() }).eq('id', r.id);
    throw error;
  }
  await supabase.from('customer_returns').update({ refund_expense_id: expense.id }).eq('id', r.id);
  if (r.outcome === 'full_refund' && r.orders?.status !== 'Returned') await setOrderStatus(supabase, r.order_id, 'Returned', actorName);
  await logEvent(supabase, r.id, 'refund_sent', actorName,
    [`₱${amount.toLocaleString('en-PH')} by ${input.method}`, reference ? `ref ${reference}` : '', input.note?.trim()].filter(Boolean).join(' · '));
}

/** Owners: store credit for the customer, used on their next order. */
export async function giveStoreCredit(
  supabase: SupabaseClient,
  r: any,
  input: { amount: number; note?: string },
  actorName: string
) {
  if (r.outcome !== 'store_credit') throw new CustomerReturnError('The owners did not decide on store credit for this case.');
  if (r.outcome_done_at) throw new CustomerReturnError('Already done.');
  if (!outcomeCanRunNow(r)) throw new CustomerReturnError('Wait for the item to arrive and be checked first.');
  const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
  if (!(amount > 0)) throw new CustomerReturnError('Enter the credit amount.');

  const { data: order } = await supabase.from('orders').select('customer_id').eq('id', r.order_id).single();
  if (!order?.customer_id) throw new CustomerReturnError('This order has no customer to give credit to.');

  const now = new Date().toISOString();
  await claim(supabase, r, {
    outcome_done_at: now, outcome_done_by_name: actorName, outcome_done_note: input.note?.trim() || null,
    credit_given: amount, amount,
  });
  const { data: cust } = await supabase.from('customers').select('store_credit').eq('id', order.customer_id).single();
  const { error } = await supabase.from('customers')
    .update({ store_credit: (Number(cust?.store_credit) || 0) + amount })
    .eq('id', order.customer_id);
  if (error) {
    await supabase.from('customer_returns').update({ outcome_done_at: null, outcome_done_by_name: null, credit_given: 0, updated_at: new Date().toISOString() }).eq('id', r.id);
    throw error;
  }
  await logEvent(supabase, r.id, 'credit_given', actorName, [`₱${amount.toLocaleString('en-PH')} store credit`, input.note?.trim()].filter(Boolean).join(' · '));
}
