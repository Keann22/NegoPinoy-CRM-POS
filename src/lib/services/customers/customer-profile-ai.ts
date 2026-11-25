import type {
  CustomerBuyingStyle,
  CustomerLifeClue,
  CustomerRecommendation,
  NextActionType,
  PersonaType,
  PriceTier,
  UnboughtInquiry,
} from '@/types';
import type { CustomerProfileContext } from './customer-profile-context';

export interface AnalyzedPersonaResult {
  personaType: PersonaType;
  personaLabel: string;
  summary: string;
  confidence: number;
  interests: string[];
  unboughtInquiries: UnboughtInquiry[];
  lifeClues: CustomerLifeClue[];
  objectionsAndPainPoints: string[];
  buyingStyle: CustomerBuyingStyle;
  salesTips: string[];
  nextActionType: NextActionType;
  recommendedItems: CustomerRecommendation[];
  draftMessage: string;
  inferredFields: {
    stoveType?: string | null;
    familySize?: string | null;
    specialtyCuisine?: string | null;
    preferredHonorific?: string | null;
    preferredPayment?: string | null;
  };
  modelUsed: string;
}

const VALID_PERSONAS: Set<PersonaType> = new Set([
  'nanay_home', 'small_negosyo', 'ofw_sender', 'reseller', 'gift_buyer', 'browser_lead', 'other',
]);
const VALID_ACTIONS: Set<NextActionType> = new Set([
  'recommend', 'payment_followup', 'restock_alert', 'check_in', 'wait',
]);
const VALID_TIERS: Set<PriceTier> = new Set(['budget', 'mid', 'premium', 'mixed']);

function buildPrompt(
  ctx: CustomerProfileContext,
  existingCorrection?: { personaType?: string | null; correctionNote?: string | null }
): string {
  const c = ctx.customer;
  const orderText = ctx.orders.slice(0, 15).map((o) => {
    const itemList = o.items.map((i) => `${i.quantity}x ${i.productName} (₱${i.unitPrice})`).join(', ');
    return `- ${o.shortId} [${o.status}] ${o.orderDate.slice(0, 10)} | ${o.paymentMethod} | Total ₱${o.totalAmount} | Bal ₱${o.balanceDue}${o.shippingName ? ` | Receiver: ${o.shippingName}` : ''}${o.deliveryInstructions ? ` | Note: ${o.deliveryInstructions}` : ''} | Items: ${itemList}`;
  }).join('\n') || 'None yet';

  const chatText = ctx.messages.slice(-60).map((m) =>
    `[${m.createdAt.slice(0, 16)} ${m.senderType === 'customer' ? 'CUSTOMER' : 'STAFF'}]: ${m.text}${m.hasImage ? ' [photo]' : ''}`
  ).join('\n') || 'No chat logs recorded yet';

  const catalogText = ctx.catalogShortlist.map((p) =>
    `- id="${p.id}" | ${p.name} | Cat: ${p.category} | Price: ₱${p.price} | Stock: ${p.shelfStock}`
  ).join('\n') || 'None';

  const correctionBlock = existingCorrection?.correctionNote || existingCorrection?.personaType
    ? `\nSTAFF CORRECTION FROM EARLIER REVIEW (respect this!):\n- Preferred persona_type: ${existingCorrection.personaType || 'unspecified'}\n- Staff note: ${existingCorrection.correctionNote || 'none'}\n`
    : '';

  return `You are a CRM Customer Analyst for NegosyantengPinoy.Ph, a Philippine cookware, kitchenware & appliance business selling on Facebook Messenger (COD, Hulugan/Lay-away, Installment, GCash, Bus Shipping, and SPX).
Build an accurate, practical customer persona so sales staff understand who this buyer is, what they want, and the smartest next step.

STRICT GROUNDING RULES:
1. Base every claim ONLY on the provided orders, metrics, and chat messages. Never invent clues.
2. OVERDUE LAY-AWAY RULE: If overdueLayawayCount > 0 (currently ${ctx.metrics.overdueLayawayCount}), you MUST set next_action_type = "payment_followup", set recommended_items = [], and write a polite Taglish payment reminder instead of pitching new items.
3. Only recommend products from the IN-STOCK CATALOG SHORTLIST below (copy exact productId & productName). Max 3 items. If overdue or browser with clear pending question, recommend 0 items.
4. Write draft_message in warm, respectful Filipino/Taglish (use "po" / Ma'am/Sir), short (2-3 sentences), never pushy.
5. Note Facebook's 24h promo rule: within24hWindow is ${ctx.metrics.within24hWindow}.
${correctionBlock}
CUSTOMER SNAPSHOT:
- Name: ${c.full_name || 'Unknown'} | Tier: ${c.suki_tier || 'Newbie'} | City/Prov: ${[c.city || c.location_city, c.province].filter(Boolean).join(', ') || 'Unknown'}
- Existing fields: stove=${c.stove_type || '?'}, family=${c.family_size || '?'}, cuisine=${c.specialty_cuisine || '?'}, honorific=${c.preferred_honorific || '?'}
- Metrics: orders=${ctx.metrics.orderCount}, spent=₱${ctx.metrics.totalSpent}, AOV=₱${ctx.metrics.avgOrderValue}, COD=${ctx.metrics.codCount}, Lay-away=${ctx.metrics.layawayCount}, Installment=${ctx.metrics.installmentCount}, Bus=${ctx.metrics.busShipCount}, DiffReceiverOrders=${ctx.metrics.differentReceiverCount}, OverdueLayaways=${ctx.metrics.overdueLayawayCount} (₱${ctx.metrics.overdueBalanceTotal})
- Top categories: ${ctx.topCategories.join(', ') || 'None'}
- Payday hint: ${ctx.paydayHint || 'Unknown'}

RECENT ORDERS:
${orderText}

MESSENGER CHAT HISTORY (oldest -> newest):
${chatText}

IN-STOCK CATALOG SHORTLIST:
${catalogText}

Return ONLY valid JSON with keys:
{
  "persona_type": "nanay_home|small_negosyo|ofw_sender|reseller|gift_buyer|browser_lead|other",
  "persona_label": "short descriptive 2-5 word title e.g. 'Home Baker Mom' or 'OFW Family Gifter'",
  "summary": "2 concise sentences in Taglish/English summarizing who they are and what drives their buying",
  "confidence": 0.0 to 1.0,
  "interests": ["up to 6 product categories/topics they care about"],
  "unbought_inquiries": [{"item": "name", "context": "what they asked", "wasOutOfStock": false}],
  "life_clues": [{"clue": "e.g. Has a catering/eatery business", "evidence": "short direct clue from chat or order"}],
  "objections_and_pain_points": ["e.g. Sensitive to shipping fee, prefers COD, waits for 15th payday"],
  "buying_style": {
    "payment_preference": "e.g. Lay-away / Hulugan via GCash",
    "shipping_preference": "e.g. SPX COD or Bus Shipping",
    "price_tier": "budget|mid|premium|mixed",
    "favorite_categories": ["up to 4"],
    "communication_style": "e.g. Polite Taglish, sends photos, asks dimensions",
    "payday_pattern": "string or null"
  },
  "sales_tips": ["2-4 actionable tips for the sales agent talking to this customer"],
  "next_action_type": "recommend|payment_followup|restock_alert|check_in|wait",
  "recommended_items": [{"productId": "uuid", "productName": "exact name", "price": 0, "reason": "why it fits"}],
  "draft_message": "warm Taglish message ready for sales to review and send",
  "inferred_customer_fields": {
    "stove_type": "Induction|Gas|Electric|Traditional|null",
    "family_size": "string or null",
    "specialty_cuisine": "string or null",
    "preferred_honorific": "Ma'am|Sir|Ate|Kuya|null",
    "preferred_payment": "string or null"
  }
}`;
}

export function buildHeuristicPersona(ctx: CustomerProfileContext): AnalyzedPersonaResult {
  const m = ctx.metrics;
  let personaType: PersonaType = 'other';
  let personaLabel = 'Regular Shopper';

  if (m.orderCount === 0 && m.chatMessageCount > 0) {
    personaType = 'browser_lead';
    personaLabel = 'Messenger Inquiry Lead';
  } else if (m.differentReceiverCount > 0 && (m.fullPaymentCount > 0 || m.layawayCount > 0)) {
    personaType = 'ofw_sender';
    personaLabel = 'Family Sender / OFW Buyer';
  } else if (ctx.orders.some((o) => o.items.some((i) => i.quantity >= 3))) {
    personaType = 'small_negosyo';
    personaLabel = 'Negosyo / Multi-Unit Buyer';
  } else if (m.orderCount >= 1) {
    personaType = 'nanay_home';
    personaLabel = 'Home & Kitchen Buyer';
  }

  const nextActionType: NextActionType =
    m.overdueLayawayCount > 0
      ? 'payment_followup'
      : ctx.catalogShortlist.length > 0 && m.orderCount > 0
        ? 'recommend'
        : 'check_in';

  const recommendedItems: CustomerRecommendation[] =
    nextActionType === 'recommend'
      ? ctx.catalogShortlist.slice(0, 2).map((p) => ({
          productId: p.id,
          productName: p.name,
          price: p.price,
          reason: `In stock (${p.shelfStock} pcs) matching past interest in ${p.category}`,
        }))
      : [];

  const firstName = (ctx.customer.full_name || 'Ma\'am/Sir').split(' ')[0];
  const draftMessage =
    nextActionType === 'payment_followup'
      ? `Hi po ${firstName}! Checking in lang po gently regarding sa open lay-away balance ninyo na ₱${m.overdueBalanceTotal.toLocaleString()}. Let us know lang po kung kailan convenient mag-hulog para ma-update namin ang schedule ninyo. Salamat po!`
      : recommendedItems[0]
        ? `Hi po ${firstName}! May bagong stock po kami ng ${recommendedItems[0].productName} (₱${recommendedItems[0].price?.toLocaleString()}) na bagay sa dati ninyong order. Sabihan nyo lang po kami kung gusto ninyo i-reserve!`
        : `Hello po ${firstName}! Kumusta po? Nandito lang kami sa Messenger kung may hanap kayo na gamit pang-bahay o pang-negosyo.`;

  const dominantPay =
    m.layawayCount + m.installmentCount > m.codCount
      ? 'Hulugan / Lay-away'
      : m.codCount > 0
        ? 'Cash on Delivery (COD)'
        : 'Not established yet';

  return {
    personaType,
    personaLabel,
    summary: `${ctx.customer.full_name || 'Customer'} has ${m.orderCount} order(s) totaling ₱${m.totalSpent.toLocaleString()} and ${m.chatMessageCount} recorded chat messages.`,
    confidence: m.orderCount > 0 && m.chatMessageCount > 0 ? 0.65 : 0.45,
    interests: ctx.topCategories,
    unboughtInquiries: [],
    lifeClues: m.differentReceiverCount > 0
      ? [{ clue: 'Orders sent to another recipient', evidence: `${m.differentReceiverCount} order(s) with different receiver name` }]
      : [],
    objectionsAndPainPoints: m.overdueLayawayCount > 0 ? ['Has overdue lay-away balance to settle first'] : [],
    buyingStyle: {
      paymentPreference: dominantPay,
      shippingPreference: m.busShipCount > 0 ? 'Bus Shipping' : 'SPX Courier',
      priceTier: m.avgOrderValue >= 3500 ? 'premium' : m.avgOrderValue >= 1200 ? 'mid' : 'budget',
      favoriteCategories: ctx.topCategories,
      communicationStyle: m.chatMessageCount > 0 ? 'Active on Messenger' : 'Order-driven (minimal chat history)',
      paydayPattern: ctx.paydayHint,
    },
    salesTips: m.overdueLayawayCount > 0
      ? ['Prioritize settling the open lay-away balance before pitching new items.']
      : ['Highlight in-stock variants matching previous categories.'],
    nextActionType,
    recommendedItems,
    draftMessage,
    inferredFields: {},
    modelUsed: 'heuristic-fallback',
  };
}

export async function analyzeCustomerPersona(
  ctx: CustomerProfileContext,
  existingCorrection?: { personaType?: string | null; correctionNote?: string | null }
): Promise<AnalyzedPersonaResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return buildHeuristicPersona(ctx);

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(ctx, existingCorrection) }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!res.ok) return buildHeuristicPersona(ctx);
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return buildHeuristicPersona(ctx);

    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const fallback = buildHeuristicPersona(ctx);

    const rawPersona = String(parsed.persona_type || '') as PersonaType;
    const personaType = VALID_PERSONAS.has(rawPersona) ? rawPersona : fallback.personaType;

    let nextActionType = String(parsed.next_action_type || '') as NextActionType;
    if (!VALID_ACTIONS.has(nextActionType)) nextActionType = fallback.nextActionType;
    if (ctx.metrics.overdueLayawayCount > 0) nextActionType = 'payment_followup';

    const catalogById = new Map(ctx.catalogShortlist.map((p) => [p.id, p]));
    const rawRecs = Array.isArray(parsed.recommended_items) ? parsed.recommended_items : [];
    const recommendedItems: CustomerRecommendation[] =
      nextActionType === 'payment_followup'
        ? []
        : rawRecs
            .map((r): CustomerRecommendation | null => {
              if (!r || typeof r !== 'object') return null;
              const rec = r as Record<string, unknown>;
              const pid = typeof rec.productId === 'string' ? rec.productId : null;
              const matched = pid ? catalogById.get(pid) : undefined;
              if (!matched) return null;
              return {
                productId: matched.id,
                productName: matched.name,
                price: matched.price,
                reason: String(rec.reason || 'Fits customer profile').slice(0, 160),
              };
            })
            .filter((x): x is CustomerRecommendation => Boolean(x))
            .slice(0, 3);

    const rawStyle = (parsed.buying_style && typeof parsed.buying_style === 'object'
      ? parsed.buying_style
      : {}) as Record<string, unknown>;
    const rawTier = String(rawStyle.price_tier || '') as PriceTier;

    const rawInferred = (parsed.inferred_customer_fields && typeof parsed.inferred_customer_fields === 'object'
      ? parsed.inferred_customer_fields
      : {}) as Record<string, unknown>;
    const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim() !== 'null' ? v.trim() : null);

    const toStrings = (arr: unknown, max: number) =>
      Array.isArray(arr) ? arr.map((x) => String(x || '').trim()).filter(Boolean).slice(0, max) : [];

    const lifeClues: CustomerLifeClue[] = Array.isArray(parsed.life_clues)
      ? parsed.life_clues
          .map((x) => {
            if (!x || typeof x !== 'object') return null;
            const o = x as Record<string, unknown>;
            const clue = String(o.clue || '').trim();
            const evidence = String(o.evidence || '').trim();
            return clue ? { clue, evidence: evidence || 'Observed in orders/chat' } : null;
          })
          .filter((x): x is CustomerLifeClue => Boolean(x))
          .slice(0, 6)
      : fallback.lifeClues;

    const unboughtInquiries: UnboughtInquiry[] = Array.isArray(parsed.unbought_inquiries)
      ? parsed.unbought_inquiries
          .map((x): UnboughtInquiry | null => {
            if (!x || typeof x !== 'object') return null;
            const o = x as Record<string, unknown>;
            const item = String(o.item || '').trim();
            return item ? { item, context: String(o.context || '').trim(), wasOutOfStock: Boolean(o.wasOutOfStock) } : null;
          })
          .filter((x): x is UnboughtInquiry => Boolean(x))
          .slice(0, 6)
      : [];

    const confNum = Number(parsed.confidence);
    return {
      personaType,
      personaLabel: strOrNull(parsed.persona_label) || fallback.personaLabel,
      summary: strOrNull(parsed.summary) || fallback.summary,
      confidence: Number.isFinite(confNum) ? Math.min(1, Math.max(0.1, confNum)) : fallback.confidence,
      interests: toStrings(parsed.interests, 6),
      unboughtInquiries,
      lifeClues,
      objectionsAndPainPoints: toStrings(parsed.objections_and_pain_points, 5),
      buyingStyle: {
        paymentPreference: strOrNull(rawStyle.payment_preference) || fallback.buyingStyle.paymentPreference,
        shippingPreference: strOrNull(rawStyle.shipping_preference) || fallback.buyingStyle.shippingPreference,
        priceTier: VALID_TIERS.has(rawTier) ? rawTier : fallback.buyingStyle.priceTier,
        favoriteCategories: toStrings(rawStyle.favorite_categories, 4),
        communicationStyle: strOrNull(rawStyle.communication_style) || fallback.buyingStyle.communicationStyle,
        paydayPattern: strOrNull(rawStyle.payday_pattern) ?? ctx.paydayHint,
      },
      salesTips: toStrings(parsed.sales_tips, 4),
      nextActionType,
      recommendedItems,
      draftMessage: strOrNull(parsed.draft_message) || fallback.draftMessage,
      inferredFields: {
        stoveType: strOrNull(rawInferred.stove_type),
        familySize: strOrNull(rawInferred.family_size),
        specialtyCuisine: strOrNull(rawInferred.specialty_cuisine),
        preferredHonorific: strOrNull(rawInferred.preferred_honorific),
        preferredPayment: strOrNull(rawInferred.preferred_payment),
      },
      modelUsed: model,
    };
  } catch (err) {
    console.warn('analyzeCustomerPersona failed, falling back to heuristic:', err);
    return buildHeuristicPersona(ctx);
  } finally {
    clearTimeout(timeout);
  }
}
