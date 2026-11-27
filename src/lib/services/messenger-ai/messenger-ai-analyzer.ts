import { readReceiver } from '@/lib/services/payments/payment-reference-check';
import { addDaysPht, phtToday } from '@/lib/shipping/ship-hold-rules';
import type {
  CopilotActionPayload,
  MessengerAiActionType,
  OrderEditItemChange,
  PaymentSplitShare,
} from '@/types';
import { CopilotError, type BurstContext } from './messenger-context-builder';

export interface AnalyzedBurstAction {
  actionType: MessengerAiActionType | 'none';
  confidence: number;
  ambiguousOrder: boolean;
  orderId: string | null;
  aiReasoning: string;
  summaryTaglish: string;
  draftReply: string | null;
  proposedPayload: CopilotActionPayload | null;
}

const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchImageInline(url: string): Promise<{ mimeType: string; data: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const len = Number(res.headers.get('content-length') || 0);
    if (len > 3_500_000) return null;
    const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const buf = Buffer.from(await res.arrayBuffer());
    return { mimeType, data: buf.toString('base64') };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function buildAnalyzerPrompt(ctx: BurstContext, enabledTypes: MessengerAiActionType[]): string {
  const ordersText = ctx.openOrders.length
    ? ctx.openOrders
        .map(
          (o) =>
            `- id="${o.id}" (${o.shortId}) | ${o.orderDate} | ${o.paymentMethod} | ${o.status} | printed=${o.isPrinted} | total=₱${o.totalAmount} | bal=₱${o.balanceDue} | items: ${o.items
              .map((i) => `${i.quantity}x ${i.productName} [productId=${i.productId}, ₱${i.unitPrice}]`)
              .join('; ')}`
        )
        .join('\n')
    : 'None (customer has 0 open orders)';

  const variantsText = ctx.candidateVariants.length
    ? ctx.candidateVariants
        .map((v) => `- id="${v.id}" | ${v.name} | ₱${v.sellingPrice} | shelf=${v.shelfStock}`)
        .join('\n')
    : 'None matched';

  const aliasText = ctx.matchedAliases.length
    ? ctx.matchedAliases.map((a) => `- "${a.phrase}" => ${a.productName} (id="${a.productId}")`).join('\n')
    : 'None';

  const lessonsText = ctx.lessons.length
    ? ctx.lessons.map((l) => `- [${l.actionType} / ${l.verdict}] ${l.lessonText}`).join('\n')
    : 'None yet';

  const threadText = ctx.recentThread
    .map((m) => `[${m.senderType === 'customer' ? 'CUSTOMER' : 'STAFF'}]: ${m.text}`)
    .join('\n');

  const today = phtToday();
  return `You are the AI Sales Copilot for NegosyantengPinoy.Ph (Philippine cookware/appliances on Facebook Messenger: COD, Lay-away/Hulugan, Installment, GCash).
Analyze the customer's LATEST MESSAGE BURST and decide if it requires a CRM action from this allowed list: ${enabledTypes.join(', ')}, or "none" if it is just an inquiry ("magkano", "available pa?"), casual chat, or not actionable yet.

TODAY (PHT): ${today}
CUSTOMER: ${ctx.customer.fullName || 'Unknown'} (id=${ctx.customer.id || 'unlinked'})
OPEN ORDERS:
${ordersText}

LEARNED PRODUCT ALIASES:
${aliasText}

CANDIDATE PRODUCT VARIANTS (NEVER use a parent product; ONLY use ids from here or from open order items):
${variantsText}

RECENT MISTAKE LESSONS FROM STAFF CORRECTIONS (avoid repeating these!):
${lessonsText}

RECENT THREAD CONTEXT:
${threadText}

LATEST CUSTOMER BURST TO ANALYZE:
${ctx.burst.chatExcerpt}
${ctx.burst.attachmentUrl ? '(Customer attached a photo — inspect it carefully if payment receipt.)' : ''}

CRITICAL RULES:
1. If the customer is ONLY asking price/availability without confirming an order, change, cancel, hold, payment, or payment date, return action_type="none".
2. MULTI-ORDER RULE: If customer has 2+ open orders and it's unclear which order they mean, set ambiguous_order=true and still pick your best guess in orderId. For add-ons ("pahabol", "dagdag"): if their only open order is already Packed/For Shipping or an older Lay-away and they want a new COD item, set createNewOrder=true.
3. For payment_proof: if image shows GCash/bank receipt, read totalAmount, 13-digit referenceNumber, ocrRawText snippet (incl. receiver phone if visible), and split shares across open orders if they said "kasama yung isang order/layaway".
4. Always write summary_taglish (clear 1-line summary in Taglish/English) and draft_reply (polite 1-2 sentence Taglish reply for sales to copy & send).

Return ONLY JSON:
{
  "action_type": "${enabledTypes.join('|')}|none",
  "confidence": 0.0 to 1.0,
  "ambiguous_order": true/false,
  "order_id": "uuid or null",
  "ai_reasoning": "short explanation of why",
  "summary_taglish": "1-line card headline",
  "draft_reply": "warm Taglish reply for sales to copy & send, or null if none",
  "payload": {
    "kind": "same as action_type",
    ...fields for that kind:
    - order_edit_items: { "kind":"order_edit_items", "orderId":"uuid|null", "createNewOrder":bool, "newOrderPaymentType":"COD|Lay-away|Full Payment", "items":[{"op":"add|remove|set_qty|swap","productId":"uuid|null","productName":"string","replaceProductId":"uuid|null","replaceProductName":"string|null","quantity":1,"unitPrice":0,"phraseUsed":"customer words"}], "note":"string|null" }
    - order_hold_or_reschedule: { "kind":"order_hold_or_reschedule", "orderId":"uuid|null", "holdKind":"with_orders|payment|adding|date|other", "shipVia":"courier|bus", "checkOn":"YYYY-MM-DD", "withOrderIds":["uuid"], "note":"string" }
    - order_cancel: { "kind":"order_cancel", "orderId":"uuid|null", "reason":"string" }
    - payment_proof: { "kind":"payment_proof", "orderId":"uuid|null", "totalAmount":0, "paymentMethod":"GCash|Bank Transfer|Cash|Other", "referenceNumber":"string|null", "ocrText":"any phone/ref text seen on receipt", "shares":[{"orderId":"uuid","amount":0}], "note":"string|null" }
    - payment_promise: { "kind":"payment_promise", "orderId":"uuid|null", "promisedDate":"YYYY-MM-DD", "promisedAmount":0, "note":"string" }
  }
}`;
}

export async function analyzeMessengerBurst(
  ctx: BurstContext,
  enabledTypes: MessengerAiActionType[]
): Promise<AnalyzedBurstAction> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new CopilotError('GEMINI_API_KEY is not configured on the server.', 500);
  if (enabledTypes.length === 0) {
    return { actionType: 'none', confidence: 0, ambiguousOrder: false, orderId: null, aiReasoning: 'No enabled actions.', summaryTaglish: '', draftReply: null, proposedPayload: null };
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const promptText = buildAnalyzerPrompt(ctx, enabledTypes);
  const inlineImg = ctx.burst.attachmentUrl ? await fetchImageInline(ctx.burst.attachmentUrl) : null;
  const parts: Array<Record<string, unknown>> = [{ text: promptText }];
  if (inlineImg) parts.push({ inline_data: { mime_type: inlineImg.mimeType, data: inlineImg.data } });

  const backoffs = [1500, 4000];
  let rawText: string | undefined;

  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 28_000);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.15,
              responseMimeType: 'application/json',
              maxOutputTokens: 2048,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        }
      );

      if (res.status === 402) {
        throw new CopilotError('Gemini AI Studio prepayment credits are depleted (HTTP 402). Top up credits to scan chats.', 402);
      }
      if (!res.ok) {
        if (RETRYABLE_HTTP.has(res.status) && attempt < 2) {
          await sleep(backoffs[attempt]);
          continue;
        }
        const errBody = await res.text().catch(() => '');
        throw new CopilotError(`Gemini request failed (${res.status}): ${errBody.slice(0, 180)}`, 502);
      }
      const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) break;
    } catch (err) {
      if (err instanceof CopilotError) throw err;
      if (attempt < 2) {
        await sleep(backoffs[attempt]);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  if (!rawText) {
    return { actionType: 'none', confidence: 0, ambiguousOrder: false, orderId: null, aiReasoning: 'Empty AI response.', summaryTaglish: '', draftReply: null, proposedPayload: null };
  }

  const parsed = JSON.parse(rawText) as Record<string, unknown>;
  const rawType = String(parsed.action_type || 'none');
  if (rawType === 'none' || !enabledTypes.includes(rawType as MessengerAiActionType)) {
    return {
      actionType: 'none',
      confidence: Number(parsed.confidence || 0),
      ambiguousOrder: false,
      orderId: null,
      aiReasoning: String(parsed.ai_reasoning || 'No CRM action needed.'),
      summaryTaglish: '',
      draftReply: null,
      proposedPayload: null,
    };
  }

  const actionType = rawType as MessengerAiActionType;
  const openOrderIds = new Set(ctx.openOrders.map((o) => o.id));
  const variantMap = new Map(ctx.candidateVariants.map((v) => [v.id, v]));
  ctx.openOrders.forEach((o) => o.items.forEach((it) => {
    if (!variantMap.has(it.productId)) {
      variantMap.set(it.productId, { id: it.productId, name: it.productName, sellingPrice: it.unitPrice, shelfStock: 0 });
    }
  }));

  let orderId = typeof parsed.order_id === 'string' && openOrderIds.has(parsed.order_id) ? parsed.order_id : null;
  if (!orderId && ctx.openOrders.length === 1) orderId = ctx.openOrders[0].id;
  const ambiguousOrder = Boolean(parsed.ambiguous_order) || (ctx.openOrders.length >= 2 && !orderId);
  const rawPayload = (parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : {}) as Record<string, unknown>;

  let proposedPayload: CopilotActionPayload | null = null;
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

    proposedPayload = {
      kind: 'order_edit_items',
      orderId,
      createNewOrder: Boolean(rawPayload.createNewOrder) || !orderId,
      newOrderPaymentType: rawPayload.newOrderPaymentType === 'Lay-away' || rawPayload.newOrderPaymentType === 'Full Payment' ? rawPayload.newOrderPaymentType : 'COD',
      items,
      note: typeof rawPayload.note === 'string' ? rawPayload.note : null,
    };
  } else if (actionType === 'order_hold_or_reschedule') {
    const rawCheck = String(rawPayload.checkOn || '');
    const checkOn = /^\d{4}-\d{2}-\d{2}$/.test(rawCheck) && rawCheck >= phtToday() ? rawCheck : addDaysPht(7);
    const withOrderIds = (Array.isArray(rawPayload.withOrderIds) ? rawPayload.withOrderIds : [])
      .map(String)
      .filter((id) => openOrderIds.has(id));
    proposedPayload = {
      kind: 'order_hold_or_reschedule',
      orderId,
      holdKind: (['with_orders', 'payment', 'adding', 'date', 'other'].includes(String(rawPayload.holdKind)) ? String(rawPayload.holdKind) : 'date') as 'with_orders' | 'payment' | 'adding' | 'date' | 'other',
      shipVia: rawPayload.shipVia === 'bus' ? 'bus' : 'courier',
      checkOn,
      withOrderIds,
      note: String(rawPayload.note || ctx.burst.chatExcerpt).slice(0, 200),
    };
  } else if (actionType === 'order_cancel') {
    proposedPayload = {
      kind: 'order_cancel',
      orderId,
      reason: String(rawPayload.reason || 'Customer requested cancel on Messenger').slice(0, 200),
    };
  } else if (actionType === 'payment_proof') {
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
    const recv = inlineImg ? readReceiver(ocrText) : null;
    const refMatch = String(rawPayload.referenceNumber || '').replace(/\D/g, '');
    proposedPayload = {
      kind: 'payment_proof',
      orderId,
      totalAmount,
      paymentMethod: rawPayload.paymentMethod === 'Bank Transfer' || rawPayload.paymentMethod === 'Cash' || rawPayload.paymentMethod === 'Other' ? rawPayload.paymentMethod : 'GCash',
      referenceNumber: refMatch.length >= 8 ? refMatch.slice(0, 16) : null,
      receiverVerified: recv ? recv.ours : null,
      receiverNote: recv && !recv.ours ? (recv.others.length ? `Shows ${recv.others.map((n) => `0${n}`).join(', ')} (not our GCash)` : 'Receiver number not visible') : null,
      shares,
      note: typeof rawPayload.note === 'string' ? rawPayload.note : null,
    };
  } else if (actionType === 'payment_promise') {
    const rawDate = String(rawPayload.promisedDate || '');
    const promisedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate >= phtToday() ? rawDate : tomorrow;
    proposedPayload = {
      kind: 'payment_promise',
      orderId,
      promisedDate,
      promisedAmount: Number(rawPayload.promisedAmount || 0) > 0 ? Number(rawPayload.promisedAmount) : null,
      note: String(rawPayload.note || ctx.burst.chatExcerpt).slice(0, 200),
    };
  }

  const conf = Number(parsed.confidence);
  return {
    actionType,
    confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0.1, conf)) : 0.6,
    ambiguousOrder,
    orderId,
    aiReasoning: String(parsed.ai_reasoning || 'Detected from Messenger chat.'),
    summaryTaglish: String(parsed.summary_taglish || `Action: ${actionType}`).slice(0, 160),
    draftReply: typeof parsed.draft_reply === 'string' && parsed.draft_reply.trim() ? parsed.draft_reply.trim() : null,
    proposedPayload,
  };
}
