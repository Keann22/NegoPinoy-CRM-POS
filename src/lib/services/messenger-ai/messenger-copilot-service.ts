import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSharedCatalogSnapshot } from '@/lib/services/customers/customer-profile-context';
import { shelfNumberOf } from '@/lib/services/inventory/shelf-stock-service';
import type {
  CopilotActionPayload,
  CopilotOpenOrderOption,
  MessengerAiAction,
  MessengerAiActionStatus,
  MessengerAiActionType,
  MessengerAiDashboardData,
  MessengerAiErrorCategory,
  MessengerAiExecutionMode,
  MessengerAiRule,
  MessengerAiVerdict,
  VariantSearchResult,
} from '@/types';
import { executeCopilotAction, isActionSuperseded } from './messenger-action-executor';
import { analyzeMessengerBurst } from './messenger-ai-analyzer';
import { maybeAutoScanBursts, persistMessengerProofImage } from './messenger-proof-and-autoscan';
import {
  buildBurstContext,
  CopilotError,
  findReadyMessageBursts,
} from './messenger-context-builder';
import {
  buildAccuracySummary,
  computePayloadDiff,
  mapAliasRow,
  mapLessonRow,
  recordReviewLearning,
} from './messenger-learning-service';

export { CopilotError };

function toRule(r: Record<string, unknown>): MessengerAiRule {
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

function toAction(r: Record<string, unknown>): MessengerAiAction {
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

async function markLogsAnalyzed(supabase: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 200) {
    await supabase.from('conversation_logs').update({ ai_analyzed_at: now }).in('id', ids.slice(i, i + 200));
  }
}

export async function scanAndAnalyzeBursts(
  supabase: SupabaseClient,
  opts: { maxBursts?: number; quietSeconds?: number; lookbackHours?: number } = {}
): Promise<{ scannedBursts: number; trivialSkipped: number; actionsCreated: number; noActionCount: number; creditError?: string }> {
  const { data: ruleRows, error: ruleErr } = await supabase.from('messenger_ai_action_rules').select('*');
  if (ruleErr) throw ruleErr;
  const rules = (ruleRows ?? []).map((r) => toRule(r as Record<string, unknown>));
  const enabledRules = rules.filter((r) => r.enabled);
  const enabledTypes = enabledRules.map((r) => r.actionType);
  const ruleMap = new Map(enabledRules.map((r) => [r.actionType, r]));

  const { readyBursts, trivialLogIds } = await findReadyMessageBursts(supabase, opts);
  await markLogsAnalyzed(supabase, trivialLogIds);
  if (readyBursts.length === 0 || enabledTypes.length === 0) {
    return { scannedBursts: 0, trivialSkipped: trivialLogIds.length, actionsCreated: 0, noActionCount: 0 };
  }

  const catalog = await loadSharedCatalogSnapshot(supabase);
  let actionsCreated = 0;
  let noActionCount = 0;
  let creditError: string | undefined;

  for (const burst of readyBursts) {
    try {
      const ctx = await buildBurstContext(supabase, burst, catalog);
      const result = await analyzeMessengerBurst(ctx, enabledTypes);
      if (result.actionType === 'none' || !result.proposedPayload) {
        noActionCount++;
        await markLogsAnalyzed(supabase, burst.logIds);
        continue;
      }

      const rule = ruleMap.get(result.actionType);
      // Day-1 & safety fallback: ambiguous or low-confidence always stays stage_confirm.
      const mode: MessengerAiExecutionMode =
        rule?.mode === 'auto_apply' && !result.ambiguousOrder && result.confidence >= (rule?.minConfidence ?? 0.75)
          ? 'auto_apply'
          : 'stage_confirm';

      const archivedAttachmentUrl =
        result.actionType === 'payment_proof' && burst.attachmentUrl
          ? await persistMessengerProofImage(supabase, burst.attachmentUrl, burst.psid)
          : burst.attachmentUrl;

      const { error: insErr } = await supabase.from('messenger_ai_actions').insert({
        psid: burst.psid,
        customer_id: ctx.customer.id,
        customer_name: ctx.customer.fullName,
        order_id: result.orderId,
        source_log_ids: burst.logIds,
        chat_excerpt: burst.chatExcerpt,
        attachment_url: archivedAttachmentUrl,
        action_type: result.actionType,
        execution_mode: mode === 'auto_apply' ? 'stage_confirm' : 'stage_confirm',
        confidence: result.confidence,
        ambiguous_order: result.ambiguousOrder,
        ai_reasoning: result.aiReasoning,
        summary_taglish: result.summaryTaglish,
        draft_reply: result.draftReply,
        before_snapshot: {},
        proposed_payload: result.proposedPayload,
        open_orders_snapshot: ctx.openOrders,
        status: 'pending_confirm',
        assignee_ids: ctx.assigneeIds,
        assignee_name: ctx.assigneeName,
      });
      if (insErr) throw insErr;
      actionsCreated++;
      await markLogsAnalyzed(supabase, burst.logIds);
    } catch (err) {
      if (err instanceof CopilotError && err.status === 402) {
        creditError = err.message;
        break;
      }
      console.warn(`Copilot burst skipped for PSID ${burst.psid}:`, err);
    }
  }

  return {
    scannedBursts: readyBursts.length,
    trivialSkipped: trivialLogIds.length,
    actionsCreated,
    noActionCount,
    creditError,
  };
}

export async function runThrottledAutoScan(supabase: SupabaseClient): Promise<boolean> {
  return maybeAutoScanBursts(supabase, () =>
    scanAndAnalyzeBursts(supabase, { maxBursts: 3, quietSeconds: 60, lookbackHours: 24 })
  );
}

export async function listPopupActions(
  supabase: SupabaseClient,
  caller: { id: string; isManagement: boolean }
): Promise<MessengerAiAction[]> {
  const [{ data: ruleRows }, { data: actionRows, error }] = await Promise.all([
    supabase.from('messenger_ai_action_rules').select('action_type, show_sales_popup'),
    supabase
      .from('messenger_ai_actions')
      .select('*')
      .in('status', ['pending_confirm', 'auto_applied_pending_check'])
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  if (error) throw error;

  const popupEnabled = new Set(
    (ruleRows ?? []).filter((r) => Boolean(r.show_sales_popup)).map((r) => String(r.action_type))
  );
  const actions = (actionRows ?? []).map((r) => toAction(r as Record<string, unknown>));
  const out: MessengerAiAction[] = [];

  for (const a of actions) {
    if (!popupEnabled.has(a.actionType)) continue;
    const isMine = a.assigneeIds.length === 0 || a.assigneeIds.includes(caller.id);
    if (!caller.isManagement && !isMine) continue;
    if (a.status === 'pending_confirm' && (await isActionSuperseded(supabase, a))) {
      await supabase.from('messenger_ai_actions').update({ status: 'auto_superseded' }).eq('id', a.id);
      continue;
    }
    out.push(a);
  }
  return out;
}

export async function reviewCopilotAction(
  supabase: SupabaseClient,
  input: {
    actionId: string;
    verdict: MessengerAiVerdict;
    finalPayload?: CopilotActionPayload;
    errorCategory?: MessengerAiErrorCategory | null;
    staffNote?: string | null;
    caller: { id: string; name: string };
  }
): Promise<{ action: MessengerAiAction; appliedSummary: string | null; draftReply: string | null }> {
  const { data: row, error } = await supabase
    .from('messenger_ai_actions')
    .select('*')
    .eq('id', input.actionId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new CopilotError('Action not found.', 404);

  const action = toAction(row as Record<string, unknown>);
  if (!['pending_confirm', 'auto_applied_pending_check'].includes(action.status)) {
    throw new CopilotError('This check was already handled.');
  }

  let appliedSummary: string | null = null;
  let nextStatus: MessengerAiActionStatus = 'rejected';
  let finalPayload: CopilotActionPayload | null = null;
  let diffFields: string[] = [];

  if (input.verdict === 'correct' || input.verdict === 'edited') {
    finalPayload = input.finalPayload || action.proposedPayload;
    appliedSummary = await executeCopilotAction(supabase, action, finalPayload, input.caller);
    diffFields = computePayloadDiff(action.proposedPayload, finalPayload);
    const effectiveVerdict: MessengerAiVerdict = diffFields.length > 0 ? 'edited' : input.verdict;
    nextStatus = effectiveVerdict === 'edited' ? 'edited_and_applied' : 'confirmed';
    await recordReviewLearning(supabase, {
      action,
      verdict: effectiveVerdict,
      finalPayload,
      diffFields,
      errorCategory: null,
      staffNote: input.staffNote ?? null,
      staffName: input.caller.name,
    });
  } else {
    nextStatus = 'rejected';
    await recordReviewLearning(supabase, {
      action,
      verdict: 'rejected',
      finalPayload: null,
      diffFields: [],
      errorCategory: input.errorCategory ?? 'other',
      staffNote: input.staffNote ?? null,
      staffName: input.caller.name,
    });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from('messenger_ai_actions')
    .update({
      status: nextStatus,
      final_payload: finalPayload,
      verdict: nextStatus === 'edited_and_applied' ? 'edited' : input.verdict,
      error_category: input.verdict === 'rejected' ? input.errorCategory ?? 'other' : diffFields[0] ?? null,
      diff_fields: diffFields.length > 0 ? diffFields : null,
      staff_note: input.staffNote ? input.staffNote.trim().slice(0, 500) : null,
      applied_summary: appliedSummary,
      reviewed_by_id: input.caller.id,
      reviewed_by_name: input.caller.name,
      reviewed_at: now,
    })
    .eq('id', action.id)
    .select('*')
    .single();
  if (updErr) throw updErr;

  const saved = toAction(updated as Record<string, unknown>);
  return { action: saved, appliedSummary, draftReply: saved.draftReply };
}

export async function getCopilotDashboardData(supabase: SupabaseClient): Promise<MessengerAiDashboardData> {
  const [rulesRes, pendingRes, reviewedRes, statsRes, lessonsRes, aliasesRes] = await Promise.all([
    supabase.from('messenger_ai_action_rules').select('*').order('phase').order('action_type'),
    supabase.from('messenger_ai_actions').select('*').in('status', ['pending_confirm', 'auto_applied_pending_check']).order('created_at', { ascending: false }).limit(50),
    supabase.from('messenger_ai_actions').select('*').not('verdict', 'is', null).order('reviewed_at', { ascending: false }).limit(30),
    supabase.from('messenger_ai_actions').select('action_type, verdict, error_category').not('verdict', 'is', null).limit(2000),
    supabase.from('messenger_ai_feedback_lessons').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('messenger_product_aliases').select('*').order('hit_count', { ascending: false }).limit(100),
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

export async function searchCatalogVariants(supabase: SupabaseClient, query: string): Promise<VariantSearchResult[]> {
  const q = query.trim();
  const { data: parents } = await supabase.from('products').select('parent_id').not('parent_id', 'is', null).limit(2000);
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
      shelfStock: shelfNumberOf({ shelf_stock: p.shelf_stock as number | null, stock_level: p.stock_level as number | null }, 0),
    }));
}
