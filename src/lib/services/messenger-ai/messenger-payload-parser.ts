import { readReceiver } from '@/lib/services/payments/payment-reference-check';
import { addDaysPht, phtToday } from '@/lib/shipping/ship-hold-rules';
import type {
  CopilotActionPayload,
  DamageComplaintReason,
  MessengerAiActionType,
  OrderEditItemChange,
  PaymentSplitShare,
  VariantSearchResult,
} from '@/types';
import type { BurstContext } from './messenger-context-builder';

const VALID_DAMAGE_REASONS: ReadonlySet<DamageComplaintReason> = new Set([
  'Damaged in transit',
  'Defective / not working',
  'Wrong item',
  'Missing item or part',
  'Other',
]);

export function parseAnalyzedPayload(params: {
  actionType: MessengerAiActionType;
  parsed: Record<string, unknown>;
  ctx: BurstContext;
  hasInlineImage: boolean;
  variantMap: Map<string, VariantSearchResult>;
  openOrderIds: Set<string>;
  allOrderIds: Set<string>;
}): { orderId: string | null; ambiguousOrder: boolean; proposedPayload: CopilotActionPayload | null } {
  const { actionType, parsed, ctx, hasInlineImage, variantMap, openOrderIds, allOrderIds } = params;
  const usesClosedToo = actionType === 'damage_or_complaint' || actionType === 'waiting_prompt_reply';
  const candidateOrders = usesClosedToo ? [...ctx.openOrders, ...ctx.recentClosedOrders] : ctx.openOrders;
  const validOrderSet = usesClosedToo ? allOrderIds : openOrderIds;

  let orderId = typeof parsed.order_id === 'string' && validOrderSet.has(parsed.order_id) ? parsed.order_id : null;
  if (!orderId && candidateOrders.length === 1) orderId = candidateOrders[0].id;
  const ambiguousOrder = Boolean(parsed.ambiguous_order) || (ctx.openOrders.length >= 2 && !orderId);
  const rawPayload = (parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : {}) as Record<string, unknown>;
  const tomorrow = addDaysPht(1);

  if (actionType === 'order_edit_items') {
    const rawItems = Array.isArray(rawPayload.items) ? rawPayload.items : [];
    const items: OrderEditItemChange[] = rawItems
      .map((x): OrderEditItemChange | null => {
        if (!x || typeof x !== 'object') return null;
        const r = x as Record<string, unknown>;
        const op = (['add', 'remove', 'set_qty', 'swap'].includes(String(r.op)) ? String(r.op) : 'add') as OrderEditItemChange['op'];
        const pid = typeof r.productId === 'string' && variantMap.has(r.productId) ? r.productId : null;
        const v = pid ? variantMap.get(pid) : undefined;
        const repId = typeof r.replaceProductId === 'string' && variantMap.has(r.replaceProductId) ? r.replaceProductId : null;
        return {
          op,
          productId: pid,
          productName: v?.name || String(r.productName || 'Item'),
          replaceProductId: repId,
          replaceProductName: repId ? variantMap.get(repId)?.name || String(r.replaceProductName || '') : null,
          quantity: Math.max(1, Math.round(Number(r.quantity || 1))),
          unitPrice: v ? v.sellingPrice : Number(r.unitPrice || 0),
          phraseUsed: typeof r.phraseUsed === 'string' ? r.phraseUsed.slice(0, 80) : null,
        };
      })
      .filter((x): x is OrderEditItemChange => Boolean(x));

    return {
      orderId,
      ambiguousOrder,
      proposedPayload: {
        kind: 'order_edit_items',
        orderId,
        createNewOrder: Boolean(rawPayload.createNewOrder) || !orderId,
        newOrderPaymentType:
          rawPayload.newOrderPaymentType === 'Lay-away' || rawPayload.newOrderPaymentType === 'Full Payment'
            ? rawPayload.newOrderPaymentType
            : 'COD',
        items,
        note: typeof rawPayload.note === 'string' ? rawPayload.note : null,
      },
    };
  }

  if (actionType === 'order_hold_or_reschedule') {
    const rawCheck = String(rawPayload.checkOn || '');
    const checkOn = /^\d{4}-\d{2}-\d{2}$/.test(rawCheck) && rawCheck >= phtToday() ? rawCheck : addDaysPht(7);
    const withOrderIds = (Array.isArray(rawPayload.withOrderIds) ? rawPayload.withOrderIds : [])
      .map(String)
      .filter((id) => openOrderIds.has(id));
    return {
      orderId,
      ambiguousOrder,
      proposedPayload: {
        kind: 'order_hold_or_reschedule',
        orderId,
        holdKind: (['with_orders', 'payment', 'adding', 'date', 'other'].includes(String(rawPayload.holdKind))
          ? String(rawPayload.holdKind)
          : 'date') as 'with_orders' | 'payment' | 'adding' | 'date' | 'other',
        shipVia: rawPayload.shipVia === 'bus' ? 'bus' : 'courier',
        checkOn,
        withOrderIds,
        note: String(rawPayload.note || ctx.burst.chatExcerpt).slice(0, 200),
      },
    };
  }

  if (actionType === 'order_cancel') {
    return {
      orderId,
      ambiguousOrder,
      proposedPayload: {
        kind: 'order_cancel',
        orderId,
        reason: String(rawPayload.reason || 'Customer requested cancel on Messenger').slice(0, 200),
      },
    };
  }

  if (actionType === 'payment_proof') {
    const totalAmount = Math.max(0, Number(rawPayload.totalAmount || 0));
    const rawShares = Array.isArray(rawPayload.shares) ? rawPayload.shares : [];
    const shares: PaymentSplitShare[] = rawShares
      .map((s) => {
        if (!s || typeof s !== 'object') return null;
        const r = s as Record<string, unknown>;
        const sid = String(r.orderId || '');
        if (!openOrderIds.has(sid)) return null;
        return { orderId: sid, amount: Math.max(0, Number(r.amount || 0)) };
      })
      .filter((x): x is PaymentSplitShare => x !== null && x.amount > 0);
    if (shares.length === 0 && orderId && totalAmount > 0) shares.push({ orderId, amount: totalAmount });

    const ocrText = `${String(rawPayload.ocrText || '')} ${ctx.burst.chatExcerpt}`;
    const recv = hasInlineImage ? readReceiver(ocrText) : null;
    const refMatch = String(rawPayload.referenceNumber || '').replace(/\D/g, '');
    return {
      orderId,
      ambiguousOrder,
      proposedPayload: {
        kind: 'payment_proof',
        orderId,
        totalAmount,
        paymentMethod:
          rawPayload.paymentMethod === 'Bank Transfer' || rawPayload.paymentMethod === 'Cash' || rawPayload.paymentMethod === 'Other'
            ? rawPayload.paymentMethod
            : 'GCash',
        referenceNumber: refMatch.length >= 8 ? refMatch.slice(0, 16) : null,
        receiverVerified: recv ? recv.ours : null,
        receiverNote:
          recv && !recv.ours
            ? recv.others.length
              ? `Shows ${recv.others.map((n) => `0${n}`).join(', ')} (not our GCash)`
              : 'Receiver number not visible'
            : null,
        shares,
        note: typeof rawPayload.note === 'string' ? rawPayload.note : null,
      },
    };
  }

  if (actionType === 'payment_promise') {
    const rawDate = String(rawPayload.promisedDate || '');
    const promisedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate >= phtToday() ? rawDate : tomorrow;
    return {
      orderId,
      ambiguousOrder,
      proposedPayload: {
        kind: 'payment_promise',
        orderId,
        promisedDate,
        promisedAmount: Number(rawPayload.promisedAmount || 0) > 0 ? Number(rawPayload.promisedAmount) : null,
        note: String(rawPayload.note || ctx.burst.chatExcerpt).slice(0, 200),
      },
    };
  }

  if (actionType === 'bus_shipping_request') {
    const rawIds = (Array.isArray(rawPayload.orderIds) ? rawPayload.orderIds : [])
      .map(String)
      .filter((id) => openOrderIds.has(id));
    const orderIds = rawIds.length > 0 ? Array.from(new Set(rawIds)) : orderId ? [orderId] : [];
    return {
      orderId: orderId || orderIds[0] || null,
      ambiguousOrder,
      proposedPayload: {
        kind: 'bus_shipping_request',
        orderId: orderId || orderIds[0] || null,
        orderIds,
        busCompany: String(rawPayload.busCompany || 'Victory Liner').trim().slice(0, 80),
        destination: String(rawPayload.destination || '').trim().slice(0, 120),
        note: typeof rawPayload.note === 'string' ? rawPayload.note.slice(0, 200) : null,
      },
    };
  }

  if (actionType === 'damage_or_complaint') {
    const rawReason = String(rawPayload.reason || '') as DamageComplaintReason;
    const reason = VALID_DAMAGE_REASONS.has(rawReason) ? rawReason : 'Damaged in transit';
    const rawItems = Array.isArray(rawPayload.items) ? rawPayload.items : [];
    const items = rawItems
      .map((x) => {
        if (!x || typeof x !== 'object') return null;
        const r = x as Record<string, unknown>;
        const productName = String(r.productName || '').trim();
        if (!productName) return null;
        return { productName, quantity: Math.max(1, Math.round(Number(r.quantity || 1))) };
      })
      .filter((x): x is { productName: string; quantity: number } => x !== null);
    return {
      orderId,
      ambiguousOrder,
      proposedPayload: {
        kind: 'damage_or_complaint',
        orderId,
        source: rawPayload.source === 'shipped_back' ? 'shipped_back' : 'damage_report',
        reason,
        items,
        notes: String(rawPayload.notes || ctx.burst.chatExcerpt).slice(0, 300),
        attachPhoto: Boolean(ctx.burst.attachmentUrl) && rawPayload.attachPhoto !== false,
      },
    };
  }

  if (actionType === 'waiting_prompt_reply') {
    const rawPromptId = typeof rawPayload.promptId === 'string' ? rawPayload.promptId : null;
    const matched =
      ctx.waitingPrompts.find((p) => rawPromptId && p.promptId === rawPromptId) ||
      ctx.waitingPrompts.find((p) => orderId && p.orderId === orderId) ||
      ctx.waitingPrompts[0];
    const promptType = matched?.promptType || (rawPayload.promptType === 'rts' || rawPayload.promptType === 'ship_hold' ? rawPayload.promptType : 'supplier_stock');
    const resolvedOrderId = matched?.orderId || orderId;
    const rawCheck = String(rawPayload.checkOn || '');
    return {
      orderId: resolvedOrderId,
      ambiguousOrder: !matched && ctx.waitingPrompts.length >= 2,
      proposedPayload: {
        kind: 'waiting_prompt_reply',
        orderId: resolvedOrderId,
        promptType,
        promptId: matched?.promptId || rawPromptId,
        choice: String(rawPayload.choice || matched?.allowedChoices[0] || 'waiting'),
        checkOn: /^\d{4}-\d{2}-\d{2}$/.test(rawCheck) && rawCheck > phtToday() ? rawCheck : null,
        shippingPayer: rawPayload.shippingPayer === 'us' || rawPayload.shippingPayer === 'customer' ? rawPayload.shippingPayer : null,
        note: typeof rawPayload.note === 'string' ? rawPayload.note.slice(0, 200) : null,
      },
    };
  }

  if (actionType === 'delivery_or_order_note') {
    const cleanPhone = typeof rawPayload.receiverPhone === 'string' ? rawPayload.receiverPhone.replace(/[^0-9+-\s]/g, '').trim().slice(0, 25) : '';
    return {
      orderId,
      ambiguousOrder,
      proposedPayload: {
        kind: 'delivery_or_order_note',
        orderId,
        deliveryNote: String(rawPayload.deliveryNote || ctx.burst.chatExcerpt).trim().slice(0, 280),
        receiverName: typeof rawPayload.receiverName === 'string' && rawPayload.receiverName.trim() ? rawPayload.receiverName.trim().slice(0, 80) : null,
        receiverPhone: cleanPhone || null,
      },
    };
  }

  return { orderId, ambiguousOrder, proposedPayload: null };
}
