import { KNOWN_BUS_COMPANIES } from '@/types/bus-shipping.types';
import { phtToday } from '@/lib/shipping/ship-hold-rules';
import type {
  CopilotActionPayload,
  MessengerAiActionType,
} from '@/types';
import { CopilotError, type BurstContext } from './messenger-context-builder';
import { parseAnalyzedPayload } from './messenger-payload-parser';

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
  const formatOrders = (list: typeof ctx.openOrders, emptyMsg: string) =>
    list.length
      ? list
          .map(
            (o) =>
              `- id="${o.id}" (${o.shortId}) | ${o.orderDate} | ${o.paymentMethod} | ${o.status} | printed=${o.isPrinted} | total=₱${o.totalAmount} | bal=₱${o.balanceDue} | items: ${o.items
                .map((i) => `${i.quantity}x ${i.productName} [productId=${i.productId}, ₱${i.unitPrice}]`)
                .join('; ')}`
          )
          .join('\n')
      : emptyMsg;

  const ordersText = formatOrders(ctx.openOrders, 'None (customer has 0 open orders)');
  const closedOrdersText = formatOrders(ctx.recentClosedOrders, 'None');
  const promptsText = ctx.waitingPrompts.length
    ? ctx.waitingPrompts
        .map(
          (p) =>
            `- promptId="${p.promptId}" | type=${p.promptType} | orderId="${p.orderId}" (${p.shortOrderId}) | ${p.summary} | choices: ${p.allowedChoices.join(', ')}`
        )
        .join('\n')
    : 'None';

  const variantsText = ctx.candidateVariants.length
    ? ctx.candidateVariants.map((v) => `- id="${v.id}" | ${v.name} | ₱${v.sellingPrice} | shelf=${v.shelfStock}`).join('\n')
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

  return `You are the AI Sales Copilot for NegosyantengPinoy.Ph (Philippine cookware/appliances on Facebook Messenger: COD, Lay-away/Hulugan, Installment, GCash).
Analyze the customer's LATEST MESSAGE BURST and decide if it requires a CRM action from this allowed list: ${enabledTypes.join(', ')}, or "none" if it is just an inquiry ("magkano", "available pa?"), casual chat, or not actionable yet.

TODAY (PHT): ${phtToday()}
CUSTOMER: ${ctx.customer.fullName || 'Unknown'} (id=${ctx.customer.id || 'unlinked'})
OPEN ORDERS:
${ordersText}

RECENT DELIVERED/SHIPPED/RETURNED ORDERS (last 30d, use for damage_or_complaint / RTS replies):
${closedOrdersText}

OPEN WAITING PROMPTS (RTS / Supplier Stock / Ship Hold):
${promptsText}

KNOWN BUS COMPANIES: ${KNOWN_BUS_COMPANIES.join(', ')}

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
${ctx.burst.attachmentUrl ? '(Customer attached a photo — inspect carefully for payment receipt OR damaged/wrong item.)' : ''}

CRITICAL RULES:
1. If the customer is ONLY asking price/availability without confirming an order, change, cancel, hold, payment, complaint, or reply, return action_type="none".
2. MULTI-ORDER RULE: If customer has 2+ open orders and it's unclear which order they mean, set ambiguous_order=true and still pick your best guess in orderId. For add-ons ("pahabol", "dagdag"): if their only open order is already Packed/For Shipping or an older Lay-away and they want a new COD item, set createNewOrder=true.
3. For payment_proof: read totalAmount, 13-digit referenceNumber, ocrText snippet (incl. receiver phone), and split shares across open orders if mentioned.
4. For waiting_prompt_reply: ONLY match if OPEN WAITING PROMPTS has an active prompt for this customer/order; reuse its exact promptId and one of its allowedChoices.
5. For damage_or_complaint: match against delivered/shipped/open order items ("basag", "sira", "kulang", "maling item").
6. For delivery_or_order_note: capture delivery gate/landmark notes or alternate receiver name/phone (never change main customer profile).
7. Always write summary_taglish (clear 1-line headline) and draft_reply (warm 1-2 sentence Taglish reply for sales to copy & send).

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
    - order_edit_items: { "kind":"order_edit_items", "orderId":"uuid|null", "createNewOrder":bool, "newOrderPaymentType":"COD|Lay-away|Full Payment", "items":[{"op":"add|remove|set_qty|swap","productId":"uuid|null","productName":"string","replaceProductId":"uuid|null","replaceProductName":"string|null","quantity":1,"unitPrice":0,"phraseUsed":"customer words"}], "note":"string|null" }
    - order_hold_or_reschedule: { "kind":"order_hold_or_reschedule", "orderId":"uuid|null", "holdKind":"with_orders|payment|adding|date|other", "shipVia":"courier|bus", "checkOn":"YYYY-MM-DD", "withOrderIds":["uuid"], "note":"string" }
    - order_cancel: { "kind":"order_cancel", "orderId":"uuid|null", "reason":"string" }
    - payment_proof: { "kind":"payment_proof", "orderId":"uuid|null", "totalAmount":0, "paymentMethod":"GCash|Bank Transfer|Cash|Other", "referenceNumber":"string|null", "ocrText":"any phone/ref text seen on receipt", "shares":[{"orderId":"uuid","amount":0}], "note":"string|null" }
    - payment_promise: { "kind":"payment_promise", "orderId":"uuid|null", "promisedDate":"YYYY-MM-DD", "promisedAmount":0, "note":"string" }
    - bus_shipping_request: { "kind":"bus_shipping_request", "orderId":"uuid|null", "orderIds":["uuid"], "busCompany":"string", "destination":"bus station/city", "note":"string|null" }
    - damage_or_complaint: { "kind":"damage_or_complaint", "orderId":"uuid|null", "source":"damage_report|shipped_back", "reason":"Damaged in transit|Defective / not working|Wrong item|Missing item or part|Other", "items":[{"productName":"string","quantity":1}], "notes":"string", "attachPhoto":true }
    - waiting_prompt_reply: { "kind":"waiting_prompt_reply", "orderId":"uuid|null", "promptType":"rts|supplier_stock|ship_hold", "promptId":"string|null", "choice":"string", "checkOn":"YYYY-MM-DD|null", "shippingPayer":"us|customer|null", "note":"string|null" }
    - delivery_or_order_note: { "kind":"delivery_or_order_note", "orderId":"uuid|null", "deliveryNote":"string", "receiverName":"string|null", "receiverPhone":"string|null" }
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
  const allOrders = [...ctx.openOrders, ...ctx.recentClosedOrders];
  const allOrderIds = new Set(allOrders.map((o) => o.id));
  const variantMap = new Map(ctx.candidateVariants.map((v) => [v.id, v]));
  allOrders.forEach((o) =>
    o.items.forEach((it) => {
      if (!variantMap.has(it.productId)) {
        variantMap.set(it.productId, { id: it.productId, name: it.productName, sellingPrice: it.unitPrice, shelfStock: 0 });
      }
    })
  );

  const { orderId, ambiguousOrder, proposedPayload } = parseAnalyzedPayload({
    actionType,
    parsed,
    ctx,
    hasInlineImage: Boolean(inlineImg),
    variantMap,
    openOrderIds,
    allOrderIds,
  });

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
