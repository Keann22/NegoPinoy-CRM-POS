import type { SupabaseClient } from '@supabase/supabase-js';
import { shelfNumberOf } from '@/lib/services/inventory/shelf-stock-service';
import type {
  CopilotActionPayload,
  CopilotOpenOrderOption,
  MessengerAiAction,
  MessengerAiActionStatus,
  MessengerAiActionType,
  MessengerAiDashboardData,
  MessengerAiErrorCategory,
  MessengerAiRule,
  MessengerAiVerdict,
  VariantSearchResult,
} from '@/types';
import { buildAccuracySummary, mapAliasRow, mapLessonRow } from './messenger-learning-service';

export function toRule(r: Record<string, unknown>): MessengerAiRule {
  return {
    actionType: String(r.action_type) as MessengerAiActionType,
    label: String(r.label),
    phase: Number(r.phase || 1),
    mode: String(r.mode) === 'auto_apply' ? 'auto_apply' : 'stage_confirm',
    enabled: Boolean(r.enabled),
    showSalesPopup: Boolean(r.show_sales_popup),
    minConfidence: Number(r.min_confidence ?? 0.72),
    updatedAt: String(r.updated_at),
    updatedByName: r.updated_by_name ? String(r.updated_by_name) : null,
  };
}

export function toAction(r: Record<string, unknown>): MessengerAiAction {
  return {
    id: String(r.id),
    psid: String(r.psid),
    customerId: r.customer_id ? String(r.customer_id) : null,
    customerName: r.customer_name ? String(r.customer_name) : null,
    orderId: r.order_id ? String(r.order_id) : null,
    sourceLogIds: Array.isArray(r.source_log_ids) ? r.source_log_ids.map(String) : [],
    chatExcerpt: String(r.chat_excerpt || ''),
    attachmentUrl: r.attachment_url ? String(r.attachment_url) : null,
    actionType: String(r.action_type) as MessengerAiActionType,
    executionMode: String(r.execution_mode) === 'auto_apply' ? 'auto_apply' : 'stage_confirm',
    confidence: Number(r.confidence || 0.5),
    ambiguousOrder: Boolean(r.ambiguous_order),
    aiReasoning: String(r.ai_reasoning || ''),
    summaryTaglish: String(r.summary_taglish || ''),
    draftReply: r.draft_reply ? String(r.draft_reply) : null,
    beforeSnapshot: (r.before_snapshot as Record<string, unknown>) || {},
    proposedPayload: r.proposed_payload as CopilotActionPayload,
    finalPayload: (r.final_payload as CopilotActionPayload | null) ?? null,
    openOrdersSnapshot: Array.isArray(r.open_orders_snapshot)
      ? (r.open_orders_snapshot as CopilotOpenOrderOption[])
      : [],
    status: String(r.status) as MessengerAiActionStatus,
    assigneeIds: Array.isArray(r.assignee_ids) ? r.assignee_ids.map(String) : [],
    assigneeName: r.assignee_name ? String(r.assignee_name) : null,
    verdict: (r.verdict as MessengerAiVerdict | null) ?? null,
    errorCategory: (r.error_category as MessengerAiErrorCategory | null) ?? null,
    diffFields: Array.isArray(r.diff_fields) ? r.diff_fields.map(String) : null,
    staffNote: r.staff_note ? String(r.staff_note) : null,
    appliedSummary: r.applied_summary ? String(r.applied_summary) : null,
    reviewedByName: r.reviewed_by_name ? String(r.reviewed_by_name) : null,
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
    createdAt: String(r.created_at),
  };
}

export async function getCopilotDashboardData(supabase: SupabaseClient): Promise<MessengerAiDashboardData> {
  const [rulesRes, pendingRes, reviewedRes, statsRes, lessonsRes, aliasesRes] = await Promise.all([
    supabase.from('messenger_ai_action_rules').select('*').order('phase').order('action_type'),
    supabase
      .from('messenger_ai_actions')
      .select('*')
      .in('status', ['pending_confirm', 'auto_applied_pending_check'])
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('messenger_ai_actions')
      .select('*')
      .not('verdict', 'is', null)
      .order('reviewed_at', { ascending: false })
      .limit(30),
    supabase
      .from('messenger_ai_actions')
      .select('action_type, verdict, error_category')
      .not('verdict', 'is', null)
      .limit(2000),
    supabase
      .from('messenger_ai_feedback_lessons')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('messenger_product_aliases')
      .select('*')
      .order('hit_count', { ascending: false })
      .limit(100),
  ]);

  if (rulesRes.error) throw rulesRes.error;
  const rules = (rulesRes.data ?? []).map((r) => toRule(r as Record<string, unknown>));
  const { accuracyByAction, topErrorCategories } = buildAccuracySummary(
    rules,
    (statsRes.data ?? []) as Array<{ action_type: string; verdict: string | null; error_category: string | null }>
  );

  return {
    rules,
    accuracyByAction,
    topErrorCategories,
    pendingActions: (pendingRes.data ?? []).map((r) => toAction(r as Record<string, unknown>)),
    recentReviewed: (reviewedRes.data ?? []).map((r) => toAction(r as Record<string, unknown>)),
    lessons: (lessonsRes.data ?? []).map((r) => mapLessonRow(r as Record<string, unknown>)),
    aliases: (aliasesRes.data ?? []).map((r) => mapAliasRow(r as Record<string, unknown>)),
  };
}

export async function searchCatalogVariants(
  supabase: SupabaseClient,
  query: string
): Promise<VariantSearchResult[]> {
  const q = query.trim();
  const { data: parents } = await supabase
    .from('products')
    .select('parent_id')
    .not('parent_id', 'is', null)
    .limit(2000);
  const parentIds = new Set((parents ?? []).map((r) => String(r.parent_id)));
  let req = supabase
    .from('products')
    .select('id, name, selling_price, sale_price, is_on_sale, shelf_stock, stock_level')
    .not('name', 'ilike', '[DELETED]%')
    .not('name', 'ilike', '[ARCHIVED]%')
    .limit(40);
  if (q) req = req.ilike('name', `%${q}%`);
  const { data, error } = await req;
  if (error) throw error;
  return (data ?? [])
    .filter((p) => !parentIds.has(String(p.id)))
    .slice(0, 20)
    .map((p) => ({
      id: String(p.id),
      name: String(p.name),
      sellingPrice: Number(p.is_on_sale && p.sale_price ? p.sale_price : p.selling_price || 0),
      shelfStock: shelfNumberOf(
        { shelf_stock: p.shelf_stock as number | null, stock_level: p.stock_level as number | null },
        0
      ),
    }));
}
