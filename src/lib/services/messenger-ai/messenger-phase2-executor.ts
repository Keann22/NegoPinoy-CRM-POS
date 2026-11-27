import type { SupabaseClient } from '@supabase/supabase-js';
import { createCustomerReturn, getReturnableLines } from '@/lib/services/customer-returns/customer-return-service';
import { decideRts, waitForCustomer } from '@/lib/services/customer-returns/customer-return-rts';
import { postOrderNote } from '@/lib/services/order-note-service';
import { markForBus, unmarkForBus } from '@/lib/services/shipping/bus-request-service';
import { answerShipHold, releaseShipHold } from '@/lib/services/shipping/ship-hold-service';
import { answerSupplierPrompt } from '@/lib/services/supplier-stock/supplier-flag-prompts';
import { addDaysPht, shortOrderId } from '@/lib/shipping/ship-hold-rules';
import type {
  BusShippingRequestPayload,
  CopilotActionPayload,
  DamageOrComplaintPayload,
  DeliveryOrOrderNotePayload,
  MessengerAiAction,
  MessengerAiActionType,
  WaitingPromptReplyPayload,
} from '@/types';
import type { SupplierPromptAnswer } from '@/types/supplier-stock.types';
import { CopilotError } from './messenger-context-builder';
import { persistMessengerAttachment } from './messenger-proof-and-autoscan';

export const AUTO_APPLY_SAFE_TYPES: ReadonlySet<MessengerAiActionType> = new Set([
  'order_hold_or_reschedule',
  'payment_promise',
  'bus_shipping_request',
  'delivery_or_order_note',
]);

const SUPPLIER_ANSWERS: ReadonlySet<SupplierPromptAnswer> = new Set([
  'wait',
  'waiting_customer',
  'editing',
  'keep_credit',
  'refund',
  'credit_added',
  'handled',
]);

export async function applyBusShippingRequest(
  supabase: SupabaseClient,
  payload: BusShippingRequestPayload,
  caller: { id: string; name: string }
): Promise<string> {
  const ids = payload.orderIds.length > 0 ? payload.orderIds : payload.orderId ? [payload.orderId] : [];
  if (ids.length === 0) throw new CopilotError('Pick at least one open order for bus shipping.');
  if (!payload.busCompany.trim() || !payload.destination.trim()) {
    throw new CopilotError('Enter both bus company and station/terminal.');
  }
  const count = await markForBus(
    supabase,
    {
      orderIds: ids,
      busCompany: payload.busCompany.trim(),
      destination: payload.destination.trim(),
      note: payload.note ?? null,
    },
    caller.name
  );
  return `Marked ${count} order(s) for ${payload.busCompany.trim()} — ${payload.destination.trim()}`;
}

export async function applyDamageOrComplaint(
  supabase: SupabaseClient,
  action: MessengerAiAction,
  payload: DamageOrComplaintPayload,
  caller: { id: string; name: string }
): Promise<string> {
  if (!payload.orderId) throw new CopilotError('Select which order the customer is reporting.');
  const lines = await getReturnableLines(supabase, payload.orderId);
  const available = lines.filter((l) => l.orderedQty - l.inOpenCaseQty > 0);
  if (available.length === 0) {
    throw new CopilotError('No returnable items left on this order (already in an open return case).');
  }

  let pickedItems: Array<{ orderItemId: string; qty: number }> = [];
  if (payload.items.length > 0) {
    for (const wanted of payload.items) {
      const needle = wanted.productName.toLowerCase();
      const match = available.find(
        (l) => l.productName.toLowerCase().includes(needle) || needle.includes(l.productName.toLowerCase())
      );
      if (match) {
        const free = Math.max(1, match.orderedQty - match.inOpenCaseQty);
        pickedItems.push({ orderItemId: match.orderItemId, qty: Math.min(free, Math.max(1, wanted.quantity)) });
      }
    }
  }
  if (pickedItems.length === 0) {
    pickedItems = available.map((l) => ({
      orderItemId: l.orderItemId,
      qty: Math.max(1, l.orderedQty - l.inOpenCaseQty),
    }));
  }

  const photoUrls: string[] = [];
  if (payload.attachPhoto && action.attachmentUrl) {
    const saved = await persistMessengerAttachment(
      supabase,
      action.attachmentUrl,
      action.psid,
      'customer-returns',
      'messenger-ai'
    );
    if (saved) photoUrls.push(saved);
  }

  const out = await createCustomerReturn(
    supabase,
    {
      orderId: payload.orderId,
      source: payload.source,
      reason: payload.reason,
      notes: payload.notes || action.chatExcerpt,
      photoUrls,
      items: pickedItems,
    },
    caller.name
  );
  return `Opened Return Case #${out.caseNo} on ${shortOrderId(payload.orderId)} (${payload.reason})`;
}

export async function applyWaitingPromptReply(
  supabase: SupabaseClient,
  payload: WaitingPromptReplyPayload,
  caller: { id: string; name: string }
): Promise<string> {
  if (!payload.orderId) throw new CopilotError('Select the order for this waiting prompt reply.');

  if (payload.promptType === 'rts') {
    let query = supabase.from('customer_returns').select('*').eq('status', 'open').eq('source', 'rts');
    query = payload.promptId ? query.eq('id', payload.promptId) : query.eq('order_id', payload.orderId).is('decided_at', null);
    const { data: row, error } = await query.limit(1).maybeSingle();
    if (error || !row) throw new CopilotError('Open RTS prompt not found.');

    if (payload.choice === 'waiting') {
      await waitForCustomer(supabase, row, payload.note || undefined, caller.name, true);
      return `Updated RTS #${row.case_no} to Waiting Customer`;
    }
    const rtsChoice = payload.choice === 'cancel' ? 'cancel' : 'resend';
    await decideRts(supabase, row, rtsChoice, payload.note || undefined, caller.name, true, payload.shippingPayer || undefined);
    return `Answered RTS #${row.case_no}: ${rtsChoice}`;
  }

  if (payload.promptType === 'ship_hold') {
    let holdId = payload.promptId;
    if (!holdId) {
      const { data: h } = await supabase
        .from('order_ship_holds')
        .select('id')
        .eq('order_id', payload.orderId)
        .is('released_at', null)
        .limit(1)
        .maybeSingle();
      holdId = h?.id ? String(h.id) : null;
    }
    if (!holdId) throw new CopilotError('Open ship hold not found.');
    const answer = payload.choice === 'release' ? 'release' : payload.choice === 'waiting' ? 'waiting' : 'not_yet';
    await answerShipHold(supabase, holdId, answer, caller.name, payload.checkOn || addDaysPht(7));
    return `Updated ship hold on ${shortOrderId(payload.orderId)} (${answer})`;
  }

  if (!payload.promptId) throw new CopilotError('Supplier stock flag reference is missing.');
  const answer: SupplierPromptAnswer = SUPPLIER_ANSWERS.has(payload.choice as SupplierPromptAnswer)
    ? (payload.choice as SupplierPromptAnswer)
    : 'wait';
  await answerSupplierPrompt(
    supabase,
    { flagId: payload.promptId, orderId: payload.orderId, answer, note: payload.note ?? null },
    { name: caller.name, isManagement: false, canSetStatus: false, isSales: true }
  );
  return `Answered supplier prompt on ${shortOrderId(payload.orderId)} (${answer})`;
}

export async function applyDeliveryOrOrderNote(
  supabase: SupabaseClient,
  payload: DeliveryOrOrderNotePayload,
  caller: { id: string; name: string }
): Promise<string> {
  if (!payload.orderId) throw new CopilotError('Select which order gets this delivery note.');
  const note = payload.deliveryNote.trim();
  if (!note) throw new CopilotError('Delivery note cannot be empty.');

  const { data: ord, error } = await supabase
    .from('orders')
    .select('id, delivery_instructions, shipping_name, shipping_phone')
    .eq('id', payload.orderId)
    .single();
  if (error || !ord) throw new CopilotError('Target order not found.');

  const prev = String(ord.delivery_instructions || '').trim();
  const nextInstr = prev ? `${prev}\n${note}` : note;
  const patch: Record<string, unknown> = { delivery_instructions: nextInstr };
  // Never overwrite customers.mobile_number; only update order-level receiver fields if provided.
  if (payload.receiverName?.trim()) patch.shipping_name = payload.receiverName.trim();
  if (payload.receiverPhone?.trim()) patch.shipping_phone = payload.receiverPhone.trim();

  const { error: updErr } = await supabase.from('orders').update(patch).eq('id', payload.orderId);
  if (updErr) throw updErr;

  const extra = [payload.receiverName, payload.receiverPhone].filter(Boolean).join(' • ');
  await postOrderNote(supabase, {
    orderId: payload.orderId,
    text: `Delivery note (Messenger): ${note}${extra ? ` [Receiver: ${extra}]` : ''}`,
    authorName: caller.name,
  });
  return `Saved delivery note on ${shortOrderId(payload.orderId)}`;
}

export async function captureBeforeSnapshot(
  supabase: SupabaseClient,
  payload: CopilotActionPayload
): Promise<Record<string, unknown>> {
  if (!payload.orderId) return {};
  if (payload.kind === 'payment_promise') {
    const { data } = await supabase.from('orders').select('next_due_date').eq('id', payload.orderId).maybeSingle();
    return { next_due_date: data?.next_due_date ?? null };
  }
  if (payload.kind === 'delivery_or_order_note') {
    const { data } = await supabase
      .from('orders')
      .select('delivery_instructions, shipping_name, shipping_phone')
      .eq('id', payload.orderId)
      .maybeSingle();
    return {
      delivery_instructions: data?.delivery_instructions ?? null,
      shipping_name: data?.shipping_name ?? null,
      shipping_phone: data?.shipping_phone ?? null,
    };
  }
  if (payload.kind === 'bus_shipping_request') {
    const ids = payload.orderIds.length > 0 ? payload.orderIds : [payload.orderId];
    return { orderIds: ids };
  }
  return {};
}

export async function undoAutoAppliedAction(
  supabase: SupabaseClient,
  action: MessengerAiAction,
  caller: { id: string; name: string }
): Promise<string> {
  const payload = action.finalPayload || action.proposedPayload;
  const snap = action.beforeSnapshot || {};

  if (payload.kind === 'order_hold_or_reschedule' && payload.orderId) {
    const { data: holdRow } = await supabase
      .from('order_ship_holds')
      .select('id')
      .eq('order_id', payload.orderId)
      .is('released_at', null)
      .limit(1)
      .maybeSingle();
    if (holdRow?.id) await releaseShipHold(supabase, String(holdRow.id), `${caller.name} (Undo AI)`);
    return `Released AI ship hold on ${shortOrderId(payload.orderId)}`;
  }

  if (payload.kind === 'bus_shipping_request') {
    const ids = Array.isArray(snap.orderIds) ? snap.orderIds.map(String) : payload.orderIds;
    for (const id of ids) await unmarkForBus(supabase, id, `${caller.name} (Undo AI)`).catch(() => undefined);
    return `Unmarked bus shipping on ${ids.length} order(s)`;
  }

  if (payload.kind === 'payment_promise' && payload.orderId) {
    await supabase
      .from('orders')
      .update({ next_due_date: (snap.next_due_date as string | null) ?? null })
      .eq('id', payload.orderId);
    return `Restored due date on ${shortOrderId(payload.orderId)}`;
  }

  if (payload.kind === 'delivery_or_order_note' && payload.orderId) {
    await supabase
      .from('orders')
      .update({
        delivery_instructions: (snap.delivery_instructions as string | null) ?? null,
        shipping_name: (snap.shipping_name as string | null) ?? null,
        shipping_phone: (snap.shipping_phone as string | null) ?? null,
      })
      .eq('id', payload.orderId);
    return `Restored delivery note on ${shortOrderId(payload.orderId)}`;
  }

  return 'Marked wrong / reverted';
}
