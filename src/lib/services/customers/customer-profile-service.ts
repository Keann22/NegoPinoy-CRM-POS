import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CustomerBuyingStyle,
  CustomerLifeClue,
  CustomerPersonaMetrics,
  CustomerProfile,
  CustomerProfileMeta,
  CustomerProfileResponse,
  CustomerRecommendation,
  NextActionType,
  PersonaType,
  StaffProfileVerdict,
  UnboughtInquiry,
} from '@/types';
import { analyzeCustomerPersona } from './customer-profile-ai';
import {
  buildCustomerProfileContext,
  CustomerProfileError,
  resolveCustomerRow,
  type SharedCatalogSnapshot,
} from './customer-profile-context';

export { CustomerProfileError };
export { listCustomerProfiles, generateBatchProfiles } from './customer-profile-list';
export { refreshStaleCustomerProfiles } from './customer-profile-refresh';

interface DbProfileRow {
  id: string;
  customer_id: string;
  psid: string | null;
  persona_type: PersonaType;
  persona_label: string;
  summary: string;
  confidence: number | string;
  interests: string[] | null;
  unbought_inquiries: UnboughtInquiry[] | null;
  life_clues: CustomerLifeClue[] | null;
  objections_and_pain_points: string[] | null;
  buying_style: CustomerBuyingStyle | null;
  sales_tips: string[] | null;
  next_action_type: NextActionType;
  recommended_items: CustomerRecommendation[] | null;
  draft_message: string | null;
  metrics: CustomerPersonaMetrics | null;
  source_order_count: number;
  source_message_count: number;
  last_message_at: string | null;
  model_used: string | null;
  staff_verdict: StaffProfileVerdict | null;
  staff_correction_note: string | null;
  staff_verified_by: string | null;
  staff_verified_at: string | null;
  needs_refresh?: boolean | null;
  generated_at: string;
  updated_at: string;
}

const DEFAULT_STYLE: CustomerBuyingStyle = {
  paymentPreference: 'Unknown',
  shippingPreference: 'SPX Courier',
  priceTier: 'mixed',
  favoriteCategories: [],
  communicationStyle: 'Unknown',
  paydayPattern: null,
};

const DEFAULT_METRICS: CustomerPersonaMetrics = {
  orderCount: 0,
  completedOrderCount: 0,
  cancelledOrReturnedCount: 0,
  totalSpent: 0,
  avgOrderValue: 0,
  codCount: 0,
  layawayCount: 0,
  installmentCount: 0,
  fullPaymentCount: 0,
  busShipCount: 0,
  overdueLayawayCount: 0,
  overdueBalanceTotal: 0,
  differentReceiverCount: 0,
  chatMessageCount: 0,
  customerMessageCount: 0,
  lastChatAt: null,
  lastOrderAt: null,
  within24hWindow: false,
};

function toCustomerProfile(r: DbProfileRow): CustomerProfile {
  return {
    id: r.id,
    customerId: r.customer_id,
    psid: r.psid,
    personaType: r.persona_type,
    personaLabel: r.persona_label,
    summary: r.summary,
    confidence: Number(r.confidence || 0.5),
    interests: Array.isArray(r.interests) ? r.interests : [],
    unboughtInquiries: Array.isArray(r.unbought_inquiries) ? r.unbought_inquiries : [],
    lifeClues: Array.isArray(r.life_clues) ? r.life_clues : [],
    objectionsAndPainPoints: Array.isArray(r.objections_and_pain_points) ? r.objections_and_pain_points : [],
    buyingStyle: r.buying_style ? { ...DEFAULT_STYLE, ...r.buying_style } : DEFAULT_STYLE,
    salesTips: Array.isArray(r.sales_tips) ? r.sales_tips : [],
    nextActionType: r.next_action_type,
    recommendedItems: Array.isArray(r.recommended_items) ? r.recommended_items : [],
    draftMessage: r.draft_message,
    metrics: r.metrics ? { ...DEFAULT_METRICS, ...r.metrics } : DEFAULT_METRICS,
    sourceOrderCount: Number(r.source_order_count || 0),
    sourceMessageCount: Number(r.source_message_count || 0),
    lastMessageAt: r.last_message_at,
    modelUsed: r.model_used,
    staffVerdict: r.staff_verdict,
    staffCorrectionNote: r.staff_correction_note,
    staffVerifiedBy: r.staff_verified_by,
    staffVerifiedAt: r.staff_verified_at,
    generatedAt: r.generated_at,
    updatedAt: r.updated_at,
  };
}

async function computeFreshMeta(
  supabase: SupabaseClient,
  row: DbProfileRow | null,
  customerId: string,
  psid: string | null
): Promise<CustomerProfileMeta> {
  const [ordRes, msgCountRes, lastCustMsgRes] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', customerId),
    psid
      ? supabase.from('conversation_logs').select('id', { count: 'exact', head: true }).eq('customer_psid', psid)
      : Promise.resolve({ count: 0 }),
    psid
      ? supabase
          .from('conversation_logs')
          .select('created_at')
          .eq('customer_psid', psid)
          .eq('sender_type', 'customer')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const currentOrders = ordRes.count ?? 0;
  const currentMsgs = msgCountRes.count ?? 0;
  const lastCustAt = (lastCustMsgRes.data as { created_at?: string } | null)?.created_at ?? null;
  const within24hWindow = Boolean(
    lastCustAt && Date.now() - new Date(lastCustAt).getTime() <= 24 * 3600 * 1000
  );

  if (!row) {
    return { isStale: false, newOrdersCount: 0, newMessagesCount: 0, within24hWindow };
  }
  const newOrdersCount = Math.max(0, currentOrders - Number(row.source_order_count || 0));
  const newMessagesCount = Math.max(0, currentMsgs - Number(row.source_message_count || 0));
  const overdueStale =
    Number(row.metrics?.overdueLayawayCount || 0) > 0 &&
    Date.now() - new Date(row.generated_at).getTime() > 7 * 86400000;
  return {
    isStale: Boolean(row.needs_refresh) || newOrdersCount > 0 || newMessagesCount >= 5 || overdueStale,
    newOrdersCount,
    newMessagesCount,
    within24hWindow,
  };
}

export async function getCustomerProfile(
  supabase: SupabaseClient,
  target: { customerId?: string; psid?: string }
): Promise<CustomerProfileResponse> {
  let customer;
  try {
    customer = await resolveCustomerRow(supabase, target);
  } catch (err) {
    if (err instanceof CustomerProfileError && !target.customerId && target.psid) {
      return {
        profile: null,
        meta: { isStale: false, newOrdersCount: 0, newMessagesCount: 0, within24hWindow: false },
      };
    }
    throw err;
  }

  const { data, error } = await supabase
    .from('customer_profiles')
    .select('*')
    .eq('customer_id', customer.id)
    .maybeSingle();
  if (error) throw error;

  const row = (data as DbProfileRow | null) ?? null;
  const meta = await computeFreshMeta(supabase, row, customer.id, customer.psid);
  return {
    profile: row ? toCustomerProfile(row) : null,
    meta,
  };
}

export async function generateCustomerProfile(
  supabase: SupabaseClient,
  target: { customerId?: string; psid?: string },
  sharedCatalog?: SharedCatalogSnapshot
): Promise<CustomerProfileResponse> {
  const ctx = await buildCustomerProfileContext(supabase, target, sharedCatalog);

  const { data: existingRow } = await supabase
    .from('customer_profiles')
    .select('persona_type, staff_verdict, staff_correction_note')
    .eq('customer_id', ctx.customer.id)
    .maybeSingle();

  const existingCorrection =
    existingRow && (existingRow.staff_verdict === 'needs_fix' || existingRow.staff_correction_note)
      ? {
          personaType: existingRow.persona_type as string | null,
          correctionNote: existingRow.staff_correction_note as string | null,
        }
      : undefined;

  const analyzed = await analyzeCustomerPersona(ctx, existingCorrection);
  const nowIso = new Date().toISOString();

  const upsertData = {
    customer_id: ctx.customer.id,
    psid: ctx.customer.psid,
    persona_type: analyzed.personaType,
    persona_label: analyzed.personaLabel,
    summary: analyzed.summary,
    confidence: analyzed.confidence,
    interests: analyzed.interests,
    unbought_inquiries: analyzed.unboughtInquiries,
    life_clues: analyzed.lifeClues,
    objections_and_pain_points: analyzed.objectionsAndPainPoints,
    buying_style: analyzed.buyingStyle,
    sales_tips: analyzed.salesTips,
    next_action_type: analyzed.nextActionType,
    recommended_items: analyzed.recommendedItems,
    draft_message: analyzed.draftMessage,
    metrics: ctx.metrics,
    source_order_count: ctx.metrics.orderCount,
    source_message_count: ctx.totalMessageCount,
    last_message_at: ctx.metrics.lastChatAt,
    model_used: analyzed.modelUsed,
    needs_refresh: false,
    needs_refresh_reason: null,
    needs_refresh_at: null,
    generated_at: nowIso,
    updated_at: nowIso,
  };

  const { data: saved, error: saveErr } = await supabase
    .from('customer_profiles')
    .upsert(upsertData, { onConflict: 'customer_id' })
    .select('*')
    .single();
  if (saveErr) throw saveErr;

  // Fill ONLY empty structured profile fields on customers (never touch ai_summary_notes).
  const fillUpdates: Record<string, string> = {};
  const inf = analyzed.inferredFields;
  if (!ctx.customer.stove_type && inf.stoveType) fillUpdates.stove_type = inf.stoveType;
  if (!ctx.customer.family_size && inf.familySize) fillUpdates.family_size = inf.familySize;
  if (!ctx.customer.specialty_cuisine && inf.specialtyCuisine) fillUpdates.specialty_cuisine = inf.specialtyCuisine;
  if (!ctx.customer.preferred_honorific && inf.preferredHonorific) fillUpdates.preferred_honorific = inf.preferredHonorific;
  if (!ctx.customer.preferred_payment && inf.preferredPayment) fillUpdates.preferred_payment = inf.preferredPayment;

  if (Object.keys(fillUpdates).length > 0) {
    const { error: fillErr } = await supabase
      .from('customers')
      .update(fillUpdates)
      .eq('id', ctx.customer.id);
    if (fillErr) console.warn('Optional customer field backfill skipped:', fillErr.message);
  }

  return {
    profile: toCustomerProfile(saved as DbProfileRow),
    meta: {
      isStale: false,
      newOrdersCount: 0,
      newMessagesCount: 0,
      within24hWindow: ctx.metrics.within24hWindow,
    },
  };
}

export async function saveProfileFeedback(
  supabase: SupabaseClient,
  input: {
    customerId: string;
    verdict: StaffProfileVerdict;
    personaType?: PersonaType;
    correctionNote?: string | null;
    staffName: string;
  }
): Promise<CustomerProfile> {
  if (!input.customerId) throw new CustomerProfileError('customerId is required');
  if (input.verdict !== 'accurate' && input.verdict !== 'needs_fix') {
    throw new CustomerProfileError('Invalid feedback verdict');
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    staff_verdict: input.verdict,
    staff_correction_note: input.correctionNote ? String(input.correctionNote).trim().slice(0, 500) : null,
    staff_verified_by: input.staffName,
    staff_verified_at: nowIso,
    updated_at: nowIso,
  };
  if (input.personaType) patch.persona_type = input.personaType;

  const { data, error } = await supabase
    .from('customer_profiles')
    .update(patch)
    .eq('customer_id', input.customerId)
    .select('*')
    .single();
  if (error) throw error;
  return toCustomerProfile(data as DbProfileRow);
}
