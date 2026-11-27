import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSharedCatalogSnapshot } from '@/lib/services/customers/customer-profile-context';
import type {
  CopilotActionPayload,
  MessengerAiAction,
  MessengerAiActionStatus,
  MessengerAiErrorCategory,
  MessengerAiExecutionMode,
  MessengerAiVerdict,
} from '@/types';
import { executeCopilotAction, isActionSuperseded } from './messenger-action-executor';
import { analyzeMessengerBurst } from './messenger-ai-analyzer';
import {
  buildBurstContext,
  CopilotError,
  findReadyMessageBursts,
} from './messenger-context-builder';
import {
  getCopilotDashboardData,
  searchCatalogVariants,
  toAction,
  toRule,
} from './messenger-copilot-queries';
import { computePayloadDiff, recordReviewLearning } from './messenger-learning-service';
import {
  AUTO_APPLY_SAFE_TYPES,
  captureBeforeSnapshot,
  undoAutoAppliedAction,
} from './messenger-phase2-executor';
import {
  maybeAutoScanBursts,
  persistMessengerAttachment,
  persistMessengerProofImage,
} from './messenger-proof-and-autoscan';

export { CopilotError, getCopilotDashboardData, searchCatalogVariants };

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
          : result.actionType === 'damage_or_complaint' && burst.attachmentUrl
            ? await persistMessengerAttachment(supabase, burst.attachmentUrl, burst.psid, 'customer-returns', 'messenger-ai')
            : burst.attachmentUrl;

      const ordersSnapshot =
        result.actionType === 'damage_or_complaint' || result.actionType === 'waiting_prompt_reply'
          ? [...ctx.openOrders, ...ctx.recentClosedOrders]
          : ctx.openOrders;

      let executionMode: MessengerAiExecutionMode = 'stage_confirm';
      let status: MessengerAiActionStatus = 'pending_confirm';
      let beforeSnapshot: Record<string, unknown> = {};
      let appliedSummary: string | null = null;

      if (mode === 'auto_apply' && AUTO_APPLY_SAFE_TYPES.has(result.actionType)) {
        try {
          beforeSnapshot = await captureBeforeSnapshot(supabase, result.proposedPayload);
          const draftAction: MessengerAiAction = {
            id: 'auto-apply',
            psid: burst.psid,
            customerId: ctx.customer.id,
            customerName: ctx.customer.fullName,
            orderId: result.orderId,
            sourceLogIds: burst.logIds,
            chatExcerpt: burst.chatExcerpt,
            attachmentUrl: archivedAttachmentUrl,
            actionType: result.actionType,
            executionMode: 'auto_apply',
            confidence: result.confidence,
            ambiguousOrder: result.ambiguousOrder,
            aiReasoning: result.aiReasoning,
            summaryTaglish: result.summaryTaglish,
            draftReply: result.draftReply,
            beforeSnapshot,
            proposedPayload: result.proposedPayload,
            finalPayload: null,
            openOrdersSnapshot: ordersSnapshot,
            status: 'auto_applied_pending_check',
            assigneeIds: ctx.assigneeIds,
            assigneeName: ctx.assigneeName,
            verdict: null,
            errorCategory: null,
            diffFields: null,
            staffNote: null,
            appliedSummary: null,
            reviewedByName: null,
            reviewedAt: null,
            createdAt: new Date().toISOString(),
          };
          appliedSummary = await executeCopilotAction(supabase, draftAction, result.proposedPayload, {
            id: 'ai-copilot',
            name: 'Messenger AI Copilot',
          });
          executionMode = 'auto_apply';
          status = 'auto_applied_pending_check';
        } catch (autoErr) {
          console.warn('Copilot auto_apply fallback to stage_confirm:', autoErr);
          beforeSnapshot = {};
          appliedSummary = null;
        }
      }

      const { error: insErr } = await supabase.from('messenger_ai_actions').insert({
        psid: burst.psid,
        customer_id: ctx.customer.id,
        customer_name: ctx.customer.fullName,
        order_id: result.orderId,
        source_log_ids: burst.logIds,
        chat_excerpt: burst.chatExcerpt,
        attachment_url: archivedAttachmentUrl,
        action_type: result.actionType,
        execution_mode: executionMode,
        confidence: result.confidence,
        ambiguous_order: result.ambiguousOrder,
        ai_reasoning: result.aiReasoning,
        summary_taglish: result.summaryTaglish,
        draft_reply: result.draftReply,
        before_snapshot: beforeSnapshot,
        proposed_payload: result.proposedPayload,
        open_orders_snapshot: ordersSnapshot,
        status,
        applied_summary: appliedSummary,
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
    diffFields = computePayloadDiff(action.proposedPayload, finalPayload);
    const effectiveVerdict: MessengerAiVerdict = diffFields.length > 0 ? 'edited' : input.verdict;
    if (action.status === 'auto_applied_pending_check') {
      if (effectiveVerdict === 'correct') {
        appliedSummary = action.appliedSummary || 'Confirmed auto-applied action';
      } else {
        await undoAutoAppliedAction(supabase, action, input.caller).catch(() => undefined);
        appliedSummary = await executeCopilotAction(supabase, action, finalPayload, input.caller);
      }
    } else {
      appliedSummary = await executeCopilotAction(supabase, action, finalPayload, input.caller);
    }
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
    if (action.status === 'auto_applied_pending_check') {
      appliedSummary = await undoAutoAppliedAction(supabase, action, input.caller);
      nextStatus = 'undone';
    } else {
      nextStatus = 'rejected';
    }
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
