import type { SupabaseClient } from '@supabase/supabase-js';
import { saveTransfer } from '@/lib/services/payments/gcash-transfer-service';
import { paymentEffect, round2 } from '@/lib/services/payments/order-payment-rules';
import { afterReferenceRead } from '@/lib/services/payments/payment-reference-check';
import { createTask, listPeople } from '@/lib/services/staff-tasks/staff-task-service';
import { shortOrderId } from '@/lib/shipping/ship-hold-rules';
import type { MessengerAiAction, PaymentPromisePayload, PaymentProofPayload } from '@/types';
import { CopilotError } from './messenger-context-builder';
import { persistMessengerProofImage } from './messenger-proof-and-autoscan';

export async function applyPaymentProof(
  supabase: SupabaseClient,
  action: MessengerAiAction,
  payload: PaymentProofPayload,
  caller: { id: string; name: string }
): Promise<string> {
  const shares = (payload.shares || []).filter((s) => s.amount > 0);
  if (shares.length === 0) throw new CopilotError('Enter at least one order and payment amount.');
  const persistedUrl = action.attachmentUrl
    ? await persistMessengerProofImage(supabase, action.attachmentUrl, action.psid)
    : null;
  const proofUrl = persistedUrl || 'messenger-chat-no-photo';
  const todayIso = new Date().toISOString();

  if (shares.length >= 2) {
    const transferAmount = round2(
      payload.totalAmount > 0 ? payload.totalAmount : shares.reduce((s, x) => s + x.amount, 0)
    );
    const res = await saveTransfer(supabase, {
      mainOrderId: shares[0].orderId,
      transferAmount,
      shares,
      paymentDate: todayIso,
      paymentMethod: payload.paymentMethod,
      notes: payload.note || `Logged via Messenger AI by ${caller.name}`,
      proofUrl,
    });
    if (payload.referenceNumber) {
      await supabase
        .from('payments')
        .update({ reference_number: payload.referenceNumber })
        .eq('transfer_id', res.transferId);
      await afterReferenceRead(supabase, res.mainPaymentId, payload.referenceNumber, transferAmount).catch(
        () => undefined
      );
    }
    return `Logged ₱${transferAmount.toLocaleString()} across ${shares.length} orders`;
  }

  const target = shares[0];
  const { data: ord, error } = await supabase
    .from('orders')
    .select('id, customer_id, status, total_amount, amount_paid, payment_method')
    .eq('id', target.orderId)
    .single();
  if (error || !ord) throw new CopilotError('Order not found.');
  const effect = paymentEffect(ord, target.amount, payload.paymentMethod);

  const { data: payRow, error: payErr } = await supabase
    .from('payments')
    .insert({
      order_id: target.orderId,
      amount: round2(target.amount),
      payment_date: todayIso,
      payment_method: payload.paymentMethod,
      notes: payload.note || `Logged via Messenger AI by ${caller.name}`,
      proof_url: proofUrl,
      status: 'Pending',
      reference_number: payload.referenceNumber || null,
      ocr_amount: payload.totalAmount > 0 ? round2(payload.totalAmount) : null,
    })
    .select('id')
    .single();
  if (payErr) throw payErr;

  const { error: ordUpdErr } = await supabase
    .from('orders')
    .update({
      amount_paid: effect.newAmountPaid,
      balance_due: effect.newBalanceDue,
      status: effect.newStatus,
    })
    .eq('id', target.orderId);
  if (ordUpdErr) throw ordUpdErr;

  if (effect.overpayment > 0.009 && ord.customer_id) {
    const { data: c } = await supabase
      .from('customers')
      .select('store_credit')
      .eq('id', ord.customer_id)
      .single();
    const nextCredit = round2(Number(c?.store_credit || 0) + effect.overpayment);
    await supabase.from('customers').update({ store_credit: nextCredit }).eq('id', ord.customer_id);
  }

  await supabase.from('order_logs').insert({
    order_id: target.orderId,
    status: 'Payment Logged',
    user_name: caller.name,
    snapshot_data: { amount: round2(target.amount), method: payload.paymentMethod, via: 'messenger_ai' },
  });
  if (payload.referenceNumber && payRow?.id) {
    await afterReferenceRead(
      supabase,
      String(payRow.id),
      payload.referenceNumber,
      payload.totalAmount || target.amount
    ).catch(() => undefined);
  }
  return `Logged ₱${round2(target.amount).toLocaleString()} (${payload.paymentMethod}) on ${shortOrderId(target.orderId)}`;
}

export async function applyPaymentPromise(
  supabase: SupabaseClient,
  action: MessengerAiAction,
  payload: PaymentPromisePayload,
  caller: { id: string; name: string }
): Promise<string> {
  const dueIso = `${payload.promisedDate}T09:00:00+08:00`;
  if (payload.orderId) {
    await supabase.from('orders').update({ next_due_date: dueIso }).eq('id', payload.orderId);
  }
  const people = await listPeople(supabase);
  const matchingKeys = people
    .filter((p) => {
      const ids = p.key.split(',');
      return action.assigneeIds.some((aid) => ids.includes(aid));
    })
    .map((p) => p.key);
  const fallbackKey =
    people.find((p) => p.key.split(',').includes(caller.id))?.key || people[0]?.key;
  const personKeys = matchingKeys.length > 0 ? [matchingKeys[0]] : fallbackKey ? [fallbackKey] : [];

  if (personKeys.length > 0) {
    const amtText = payload.promisedAmount ? ` (₱${payload.promisedAmount.toLocaleString()})` : '';
    await createTask(
      supabase,
      {
        personKeys,
        message: `Follow up ${action.customerName || 'customer'} payment promise${amtText}: ${payload.note}`,
        orderId: payload.orderId,
        dueAt: dueIso,
      },
      caller
    );
  }
  return `Scheduled payment follow-up for ${payload.promisedDate}`;
}
