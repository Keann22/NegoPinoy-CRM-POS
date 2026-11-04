import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTION_LABELS, reconcileRules } from './payment-discrepancy-rules';
import {
  isReconciled,
  loadPayments,
  loadPaymentsByRef,
  othersOnTransfer,
  refsFor,
  shortId,
  type LivePayment,
} from './payment-discrepancy-service';
import type { DiscrepancySource, ReconcileAction } from '@/types/payment-discrepancy.types';

export class ReconcileError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const appendNote = (notes: string | null, note: string) => `${(notes || '').trim()} ${note}`.trim();

/**
 * Applies one fix to a payment on the GCash mismatch list. The GCash amount always comes
 * from the list on the server, never from the browser, and a payment is fixed only once.
 */
export async function reconcilePayment(
  supabase: SupabaseClient,
  source: DiscrepancySource,
  action: ReconcileAction,
): Promise<string> {
  const payment = (await loadPayments(supabase, [source.paymentId])).get(source.paymentId);
  if (!payment) throw new ReconcileError('This payment no longer exists.', 404);
  if (isReconciled(payment.notes)) throw new ReconcileError('This payment was already fixed. Reload the page.', 409);
  if (Math.abs(payment.amount - source.recordedAmount) > 0.01) {
    throw new ReconcileError(
      `This payment was changed after the list was made (${peso(source.recordedAmount)} → ${peso(payment.amount)}). ` +
        'Check the order by hand.',
      409,
    );
  }

  const others = othersOnTransfer(source, payment, await loadPaymentsByRef(supabase, refsFor(source, payment)));
  const othersTotal = others.reduce((sum, o) => sum + o.amount, 0);
  const gcash = source.gcashAmount;
  const rules = reconcileRules({ recorded: payment.amount, gcash, otherCount: others.length, othersTotal });
  if (!rules.allowed.includes(action)) {
    throw new ReconcileError(rules.blockedReason || `"${ACTION_LABELS[action]}" doesn't fit this payment. Reload the page.`);
  }

  if (action === 'split_payment') return splitTransfer(supabase, payment, others, gcash);

  const newAmount = action === 'typo_correction' ? gcash : rules.share;
  return changeAmount(supabase, payment, action, newAmount);
}

async function splitTransfer(
  supabase: SupabaseClient,
  payment: LivePayment,
  others: ReturnType<typeof othersOnTransfer>,
  gcash: number,
): Promise<string> {
  const otherIds = others.map((o) => `#${o.orderShortId}`).join(', ');
  await claimPayment(supabase, payment, {
    notes: appendNote(payment.notes, `[Reconciled: Split GCash ${peso(gcash)} with ${otherIds}]`),
  });

  const open = others.filter((o) => !o.isReconciled);
  const live = await loadPayments(supabase, open.map((o) => o.paymentId));
  for (const other of live.values()) {
    if (isReconciled(other.notes)) continue;
    const note = `[Reconciled: Split GCash ${peso(gcash)} with #${shortId(payment.order_id)}]`;
    const { error } = await supabase
      .from('payments')
      .update({ notes: appendNote(other.notes, note), status: 'Verified' })
      .eq('id', other.id);
    if (error) throw error;
  }

  const covered = payment.amount + others.reduce((sum, o) => sum + o.amount, 0);
  const left = gcash - covered;
  return left > 1
    ? `Linked ${others.length + 1} orders on this transfer. ${peso(left)} of it isn't on any order yet.`
    : `Linked ${others.length + 1} orders on this transfer. It is fully accounted for.`;
}

/** Credit, tip or typo: set the payment to the right amount and move the order's totals with it. */
async function changeAmount(
  supabase: SupabaseClient,
  payment: LivePayment,
  action: Exclude<ReconcileAction, 'split_payment'>,
  newAmount: number,
): Promise<string> {
  if (!payment.order_id) throw new ReconcileError('This payment is not linked to an order.');
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, amount_paid, total_amount, customer_id')
    .eq('id', payment.order_id)
    .single();
  if (orderError || !order) throw new ReconcileError('The order for this payment was not found.', 404);

  const diff = newAmount - payment.amount;
  const total = Number(order.total_amount || 0);
  const oldPaid = Number(order.amount_paid || 0);
  const newPaid = oldPaid + diff;
  const newBalance = Math.max(0, total - newPaid);
  // Only money that is extra because of this fix; earlier overpayment was handled before.
  const newExcess = Math.max(0, Math.max(0, newPaid - total) - Math.max(0, oldPaid - total));

  const note =
    action === 'typo_correction'
      ? `[Reconciled: Entry typo corrected from ${peso(payment.amount)} to ${peso(newAmount)}]`
      : action === 'tip'
        ? `[Reconciled: ${peso(diff)} tip / keep the change]`
        : `[Reconciled: Customer paid ${peso(diff)} more; ${peso(newExcess)} added to store credit]`;

  await claimPayment(supabase, payment, { amount: newAmount, notes: appendNote(payment.notes, note) });
  const undoPayment = () =>
    supabase
      .from('payments')
      .update({ amount: payment.amount, notes: payment.notes, status: payment.status })
      .eq('id', payment.id);

  const { error: updateOrderError } = await supabase
    .from('orders')
    .update({ amount_paid: newPaid, balance_due: newBalance })
    .eq('id', order.id);
  if (updateOrderError) {
    await undoPayment();
    throw updateOrderError;
  }

  if (action === 'overpayment_credit' && newExcess > 0.009) {
    const creditError = await addStoreCredit(supabase, order.customer_id, newExcess);
    if (creditError) {
      await supabase.from('orders').update({ amount_paid: oldPaid, balance_due: Math.max(0, total - oldPaid) }).eq('id', order.id);
      await undoPayment();
      throw new ReconcileError(`Could not add store credit: ${creditError}. Nothing was changed.`, 500);
    }
  }

  if (action === 'typo_correction') {
    return `Payment lowered from ${peso(payment.amount)} to ${peso(newAmount)}.` +
      (newBalance > 0 ? ` The order now has ${peso(newBalance)} left to pay.` : '');
  }
  const towardBalance = diff - newExcess;
  const parts = [`Payment raised to ${peso(newAmount)}.`];
  if (towardBalance > 0.009) parts.push(`${peso(towardBalance)} went toward the order's unpaid balance.`);
  if (newExcess > 0.009) {
    parts.push(action === 'tip' ? `${peso(newExcess)} kept as a tip.` : `${peso(newExcess)} added to the customer's store credit.`);
  }
  return parts.join(' ');
}

/** Saves only if nobody changed the payment since we read it (no double fixes). */
async function claimPayment(
  supabase: SupabaseClient,
  payment: LivePayment,
  patch: { amount?: number; notes: string },
): Promise<void> {
  let query = supabase
    .from('payments')
    .update({ ...patch, status: 'Verified' })
    .eq('id', payment.id)
    .eq('amount', payment.amount);
  query = payment.notes === null ? query.is('notes', null) : query.eq('notes', payment.notes);
  const { data, error } = await query.select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new ReconcileError('Someone else just changed this payment. Reload the page.', 409);
  }
}

async function addStoreCredit(
  supabase: SupabaseClient,
  customerId: string | null,
  amount: number,
): Promise<string | null> {
  if (!customerId) return 'the order has no customer';
  const { data: customer, error } = await supabase
    .from('customers')
    .select('store_credit')
    .eq('id', customerId)
    .single();
  if (error) return error.message;
  const { error: updateError } = await supabase
    .from('customers')
    .update({ store_credit: Number(customer?.store_credit || 0) + amount })
    .eq('id', customerId);
  return updateError ? updateError.message : null;
}
