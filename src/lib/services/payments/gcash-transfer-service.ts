import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isLayawayOrder, paymentEffect, round2, suggestedShare } from './order-payment-rules';
import type {
  SaveTransferInput,
  SaveTransferResult,
  TransferOrder,
} from '@/types/gcash-transfer.types';

/**
 * One GCash transfer that pays several orders of the same customer (owner, 2026-11-04).
 * Each order gets its own payment row; the rows share a transfer_id and remember the
 * whole transfer amount. Extra money goes to store credit (or is a tip).
 */

export class TransferError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const CLOSED_STATUSES = ['Cancelled', 'Returned'];
const ORDER_COLUMNS =
  'id, customer_id, status, order_date, created_at, total_amount, amount_paid, balance_due, installment_months, monthly_payment, payment_method';

interface OrderRow {
  id: string;
  customer_id: string | null;
  status: string;
  order_date: string | null;
  created_at: string | null;
  total_amount: number | string | null;
  amount_paid: number | string | null;
  balance_due: number | string | null;
  installment_months: number | null;
  monthly_payment: number | string | null;
  payment_method: string | null;
}

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortId = (id: string) => id.slice(0, 7).toUpperCase();

function toTransferOrder(o: OrderRow, lastPayment: number | null): TransferOrder {
  const isLayaway = isLayawayOrder(o);
  return {
    id: o.id,
    shortId: shortId(o.id),
    status: o.status,
    orderDate: o.order_date || o.created_at,
    totalAmount: Number(o.total_amount || 0),
    balanceDue: Math.max(0, Number(o.balance_due || 0)),
    isLayaway,
    monthlyPayment: isLayaway ? Number(o.monthly_payment || 0) || null : null,
    lastPayment: isLayaway ? lastPayment : null,
    suggestedShare: suggestedShare(o, lastPayment),
  };
}

/** Each order's most recent payment amount. */
async function lastPayments(supabase: SupabaseClient, orderIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (orderIds.length === 0) return map;
  const { data, error } = await supabase
    .from('payments')
    .select('order_id, amount, payment_date')
    .in('order_id', orderIds)
    .order('payment_date', { ascending: false });
  if (error) throw error;
  for (const p of (data || []) as { order_id: string; amount: number | string }[]) {
    if (!map.has(p.order_id)) map.set(p.order_id, Number(p.amount));
  }
  return map;
}

/** The opened order first, then the same customer's other orders that still owe money. */
export async function ordersForTransfer(supabase: SupabaseClient, orderId: string): Promise<TransferOrder[]> {
  const { data: main, error } = await supabase.from('orders').select(ORDER_COLUMNS).eq('id', orderId).single();
  if (error || !main) throw new TransferError('Order not found.', 404);
  const order = main as OrderRow;
  if (!order.customer_id) return [toTransferOrder(order, (await lastPayments(supabase, [order.id])).get(order.id) ?? null)];

  const { data: others, error: othersError } = await supabase
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('customer_id', order.customer_id)
    .neq('id', orderId)
    .gt('balance_due', 0.009)
    .not('status', 'in', `(${CLOSED_STATUSES.map((s) => `"${s}"`).join(',')})`)
    .order('created_at', { ascending: true })
    .limit(50);
  if (othersError) throw othersError;
  const all = [order, ...(others as OrderRow[])];
  const last = await lastPayments(supabase, all.filter(isLayawayOrder).map((o) => o.id));
  return all.map((o) => toTransferOrder(o, last.get(o.id) ?? null));
}

export async function saveTransfer(supabase: SupabaseClient, input: SaveTransferInput): Promise<SaveTransferResult> {
  const transferAmount = round2(Number(input.transferAmount));
  const shares = input.shares.map((s) => ({ orderId: String(s.orderId), amount: round2(Number(s.amount)) }));
  if (!(transferAmount > 0)) throw new TransferError('Enter the GCash amount.');
  if (shares.length < 2) throw new TransferError('Pick at least one other order, or log it as a normal payment.');
  if (new Set(shares.map((s) => s.orderId)).size !== shares.length) throw new TransferError('An order is listed twice.');
  if (!shares.some((s) => s.orderId === input.mainOrderId)) throw new TransferError('The order you opened must be in the list.');
  if (shares.some((s) => !(s.amount > 0))) throw new TransferError('Every picked order needs an amount above ₱0.');
  if (!input.proofUrl) throw new TransferError('Proof of payment is required.');

  const { data, error } = await supabase.from('orders').select(ORDER_COLUMNS).in('id', shares.map((s) => s.orderId));
  if (error) throw error;
  const orders = new Map((data as OrderRow[]).map((o) => [o.id, o]));
  if (orders.size !== shares.length) throw new TransferError('One of the orders was not found. Reload and try again.', 404);

  // Same customer only (owner, 2026-11-04).
  const customerId = orders.get(input.mainOrderId)!.customer_id;
  if (!customerId || [...orders.values()].some((o) => o.customer_id !== customerId)) {
    throw new TransferError('One GCash can only pay orders of the same customer.');
  }
  for (const s of shares) {
    const o = orders.get(s.orderId)!;
    if (CLOSED_STATUSES.includes(o.status)) throw new TransferError(`#${shortId(o.id)} is ${o.status}.`);
    const balance = Math.max(0, Number(o.balance_due || 0));
    if (s.amount > balance + 0.01) {
      throw new TransferError(`#${shortId(o.id)} only owes ${peso(balance)}, but ${peso(s.amount)} was put on it.`);
    }
  }

  const sharesTotal = round2(shares.reduce((sum, s) => sum + s.amount, 0));
  if (sharesTotal > transferAmount + 0.01) {
    throw new TransferError(`The orders add up to ${peso(sharesTotal)}, more than the ${peso(transferAmount)} GCash.`);
  }
  const extra = round2(Math.max(0, transferAmount - sharesTotal));
  const mainShare = shares.find((s) => s.orderId === input.mainOrderId)!;
  const mainBalance = Math.max(0, Number(orders.get(input.mainOrderId)!.balance_due || 0));
  if (extra > 0.009 && mainShare.amount < mainBalance - 0.01) {
    throw new TransferError(
      `${peso(extra)} of the GCash isn't on any order. Put it on an order that still owes, ` +
        `or pay #${shortId(input.mainOrderId)} in full so the extra becomes store credit.`,
    );
  }

  // Build the payment rows (the extra rides on the main order, like any overpayment).
  const transferId = randomUUID();
  const summary = shares.map((s) => `#${shortId(s.orderId)} ${peso(s.amount)}`).join(', ');
  const baseNote = (input.notes || '').trim();
  const rows = shares.map((s) => {
    const isMain = s.orderId === input.mainOrderId;
    const amount = round2(isMain ? s.amount + extra : s.amount);
    let note = `[One GCash ${peso(transferAmount)} for ${summary}]`;
    if (isMain && extra > 0.009) {
      note += input.isTip ? ` [Tip / keep the change: ${peso(extra)}]` : ` [Extra ${peso(extra)} to store credit]`;
    }
    return {
      order_id: s.orderId,
      payment_date: input.paymentDate,
      amount,
      payment_method: input.paymentMethod,
      notes: `${baseNote} ${note}`.trim(),
      proof_url: input.proofUrl,
      transfer_id: transferId,
      transfer_amount: transferAmount,
    };
  });

  const { data: inserted, error: insertError } = await supabase.from('payments').insert(rows).select('id, order_id');
  if (insertError) throw insertError;
  const payments = inserted as { id: string; order_id: string }[];

  const undone: { id: string; amount_paid: unknown; balance_due: unknown; status: string }[] = [];
  const rollback = async () => {
    for (const o of undone) {
      await supabase.from('orders').update({ amount_paid: o.amount_paid, balance_due: o.balance_due, status: o.status }).eq('id', o.id);
    }
    await supabase.from('payments').delete().eq('transfer_id', transferId);
  };

  const fullyPaidOrderIds: string[] = [];
  let mainOverpayment = 0;
  try {
    for (const row of rows) {
      const o = orders.get(row.order_id)!;
      const effect = paymentEffect(o, row.amount, input.paymentMethod);
      // Only if nobody changed the order since we read it.
      let update = supabase
        .from('orders')
        .update({ amount_paid: effect.newAmountPaid, balance_due: effect.newBalanceDue, status: effect.newStatus })
        .eq('id', o.id);
      update = o.amount_paid === null ? update.is('amount_paid', null) : update.eq('amount_paid', Number(o.amount_paid));
      const { data: updated, error: updateError } = await update.select('id');
      if (updateError) throw updateError;
      if (!updated || updated.length === 0) {
        throw new TransferError(`#${shortId(o.id)} was changed by someone else just now. Try again.`, 409);
      }
      undone.push({ id: o.id, amount_paid: o.amount_paid, balance_due: o.balance_due, status: o.status });
      if (effect.newBalanceDue <= 0.009) fullyPaidOrderIds.push(o.id);
      if (row.order_id === input.mainOrderId) mainOverpayment = effect.overpayment;
    }

    if (mainOverpayment > 0.009 && !input.isTip) {
      const { data: customer, error: custError } = await supabase
        .from('customers')
        .select('store_credit')
        .eq('id', customerId)
        .single();
      if (custError) throw custError;
      const { error: creditError } = await supabase
        .from('customers')
        .update({ store_credit: Number(customer?.store_credit || 0) + mainOverpayment })
        .eq('id', customerId);
      if (creditError) throw creditError;
    }
  } catch (err) {
    await rollback();
    throw err;
  }

  return {
    transferId,
    mainPaymentId: payments.find((p) => p.order_id === input.mainOrderId)!.id,
    fullyPaidOrderIds,
    storeCredit: input.isTip ? 0 : round2(mainOverpayment),
    tip: input.isTip ? round2(mainOverpayment) : 0,
  };
}
