import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CopilotActionPayload,
  MessengerAiAccuracyRow,
  MessengerAiAction,
  MessengerAiActionType,
  MessengerAiErrorCategory,
  MessengerAiLesson,
  MessengerAiRule,
  MessengerAiVerdict,
  MessengerProductAlias,
  OrderEditItemsPayload,
} from '@/types';

export function computePayloadDiff(
  proposed: CopilotActionPayload,
  final: CopilotActionPayload
): string[] {
  const diffs = new Set<string>();
  if (proposed.kind !== final.kind) {
    diffs.add('wrong_action_type');
    return Array.from(diffs);
  }
  if ((proposed.orderId || null) !== (final.orderId || null)) diffs.add('wrong_order');

  if (proposed.kind === 'order_edit_items' && final.kind === 'order_edit_items') {
    if (proposed.createNewOrder !== final.createNewOrder) diffs.add('wrong_action_type');
    const pIds = proposed.items.map((i) => i.productId || i.productName).sort().join('|');
    const fIds = final.items.map((i) => i.productId || i.productName).sort().join('|');
    if (pIds !== fIds) diffs.add('wrong_variant');
    const pQty = proposed.items.map((i) => `${i.productId}:${i.quantity}`).sort().join('|');
    const fQty = final.items.map((i) => `${i.productId}:${i.quantity}`).sort().join('|');
    if (pQty !== fQty && pIds === fIds) diffs.add('wrong_qty');
  } else if (proposed.kind === 'order_hold_or_reschedule' && final.kind === 'order_hold_or_reschedule') {
    if (proposed.checkOn !== final.checkOn) diffs.add('wrong_date');
    if (proposed.holdKind !== final.holdKind || proposed.shipVia !== final.shipVia) diffs.add('wrong_action_type');
    if ((proposed.withOrderIds || []).join(',') !== (final.withOrderIds || []).join(',')) diffs.add('wrong_order');
  } else if (proposed.kind === 'payment_proof' && final.kind === 'payment_proof') {
    if (Math.abs(proposed.totalAmount - final.totalAmount) > 0.5) diffs.add('wrong_amount');
    const pShares = proposed.shares.map((s) => `${s.orderId}:${s.amount}`).sort().join('|');
    const fShares = final.shares.map((s) => `${s.orderId}:${s.amount}`).sort().join('|');
    if (pShares !== fShares) diffs.add('wrong_order');
  } else if (proposed.kind === 'payment_promise' && final.kind === 'payment_promise') {
    if (proposed.promisedDate !== final.promisedDate) diffs.add('wrong_date');
    if ((proposed.promisedAmount || 0) !== (final.promisedAmount || 0)) diffs.add('wrong_amount');
  }

  return Array.from(diffs);
}

async function learnProductAliases(
  supabase: SupabaseClient,
  payload: OrderEditItemsPayload,
  source: 'confirmed_ai' | 'staff_correction'
) {
  for (const item of payload.items) {
    const phrase = String(item.phraseUsed || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!phrase || phrase.length < 3 || !item.productId) continue;

    // Never store a parent product as an alias.
    const { data: children } = await supabase
      .from('products')
      .select('id')
      .eq('parent_id', item.productId)
      .limit(1);
    if (children && children.length > 0) continue;

    const { data: existing } = await supabase
      .from('messenger_product_aliases')
      .select('id, hit_count, product_id')
      .eq('phrase_normalized', phrase)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('messenger_product_aliases')
        .update({
          product_id: item.productId,
          product_name: item.productName,
          source: source === 'staff_correction' ? 'staff_correction' : undefined,
          hit_count: existing.product_id === item.productId ? Number(existing.hit_count || 1) + 1 : 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('messenger_product_aliases').insert({
        phrase_normalized: phrase,
        product_id: item.productId,
        product_name: item.productName,
        source,
        hit_count: 1,
      });
    }
  }
}

export async function recordReviewLearning(
  supabase: SupabaseClient,
  params: {
    action: MessengerAiAction;
    verdict: MessengerAiVerdict;
    finalPayload: CopilotActionPayload | null;
    diffFields: string[];
    errorCategory: MessengerAiErrorCategory | null;
    staffNote: string | null;
    staffName: string;
  }
): Promise<void> {
  const { action, verdict, finalPayload, diffFields, errorCategory, staffNote, staffName } = params;

  if (verdict === 'correct' && action.proposedPayload.kind === 'order_edit_items') {
    await learnProductAliases(supabase, action.proposedPayload, 'confirmed_ai').catch(() => undefined);
    return;
  }

  if (verdict === 'edited' && finalPayload) {
    if (finalPayload.kind === 'order_edit_items') {
      await learnProductAliases(supabase, finalPayload, 'staff_correction').catch(() => undefined);
    }
    const diffSummary = diffFields.length ? diffFields.join(', ') : 'payload adjusted';
    const lessonText = `Chat "${action.chatExcerpt.slice(0, 110)}" — AI proposed ${action.actionType} (${diffSummary}); staff corrected it.${staffNote ? ` Note: ${staffNote}` : ''}`;
    await supabase.from('messenger_ai_feedback_lessons').insert({
      action_id: action.id,
      action_type: action.actionType,
      verdict: 'edited',
      error_category: diffFields[0] || 'other',
      chat_excerpt: action.chatExcerpt.slice(0, 400),
      what_ai_did: action.proposedPayload as unknown as Record<string, unknown>,
      what_was_right: finalPayload as unknown as Record<string, unknown>,
      lesson_text: lessonText.slice(0, 500),
      active: true,
      created_by_name: staffName,
    });
    return;
  }

  if (verdict === 'rejected') {
    const cat = errorCategory || 'other';
    const lessonText = `Chat "${action.chatExcerpt.slice(0, 110)}" — Do NOT trigger ${action.actionType} here (${cat}).${staffNote ? ` Staff note: ${staffNote}` : ''}`;
    await supabase.from('messenger_ai_feedback_lessons').insert({
      action_id: action.id,
      action_type: action.actionType,
      verdict: 'rejected',
      error_category: cat,
      chat_excerpt: action.chatExcerpt.slice(0, 400),
      what_ai_did: action.proposedPayload as unknown as Record<string, unknown>,
      what_was_right: { rejectedReason: cat, staffNote: staffNote || null },
      lesson_text: lessonText.slice(0, 500),
      active: true,
      created_by_name: staffName,
    });
  }
}

export function buildAccuracySummary(
  rules: MessengerAiRule[],
  reviewedRows: Array<{ action_type: string; verdict: string | null; error_category: string | null }>
): { accuracyByAction: MessengerAiAccuracyRow[]; topErrorCategories: Array<{ category: string; count: number }> } {
  const errCounts = new Map<string, number>();
  const byType = new Map<string, { correct: number; edited: number; rejected: number }>();

  for (const r of reviewedRows) {
    if (!r.verdict) continue;
    const entry = byType.get(r.action_type) || { correct: 0, edited: 0, rejected: 0 };
    if (r.verdict === 'correct') entry.correct++;
    else if (r.verdict === 'edited') entry.edited++;
    else if (r.verdict === 'rejected') entry.rejected++;
    byType.set(r.action_type, entry);

    if (r.verdict !== 'correct' && r.error_category) {
      errCounts.set(r.error_category, (errCounts.get(r.error_category) || 0) + 1);
    }
  }

  const accuracyByAction: MessengerAiAccuracyRow[] = rules
    .filter((rule) => rule.phase === 1 || byType.has(rule.actionType))
    .map((rule) => {
      const c = byType.get(rule.actionType) || { correct: 0, edited: 0, rejected: 0 };
      const totalReviewed = c.correct + c.edited + c.rejected;
      const accuracyRate = totalReviewed > 0 ? Math.round((c.correct / totalReviewed) * 1000) / 1000 : 0;
      return {
        actionType: rule.actionType,
        label: rule.label,
        totalReviewed,
        correctCount: c.correct,
        editedCount: c.edited,
        rejectedCount: c.rejected,
        accuracyRate,
        graduationReady: totalReviewed >= 30 && accuracyRate >= 0.95,
      };
    });

  const topErrorCategories = Array.from(errCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, count]) => ({ category, count }));

  return { accuracyByAction, topErrorCategories };
}

export function mapLessonRow(r: Record<string, unknown>): MessengerAiLesson {
  return {
    id: String(r.id),
    actionId: r.action_id ? String(r.action_id) : null,
    actionType: String(r.action_type) as MessengerAiActionType,
    verdict: String(r.verdict) === 'rejected' ? 'rejected' : 'edited',
    errorCategory: r.error_category ? String(r.error_category) : null,
    chatExcerpt: String(r.chat_excerpt || ''),
    whatAiDid: (r.what_ai_did as Record<string, unknown>) || {},
    whatWasRight: (r.what_was_right as Record<string, unknown>) || {},
    lessonText: String(r.lesson_text || ''),
    active: Boolean(r.active),
    createdByName: r.created_by_name ? String(r.created_by_name) : null,
    createdAt: String(r.created_at),
  };
}

export function mapAliasRow(r: Record<string, unknown>): MessengerProductAlias {
  return {
    id: String(r.id),
    phraseNormalized: String(r.phrase_normalized),
    productId: String(r.product_id),
    productName: String(r.product_name),
    source: (String(r.source || 'manual') as MessengerProductAlias['source']),
    hitCount: Number(r.hit_count || 1),
    updatedAt: String(r.updated_at),
  };
}

export async function updateCopilotRule(
  supabase: SupabaseClient,
  input: {
    actionType: MessengerAiActionType;
    enabled?: boolean;
    mode?: 'stage_confirm' | 'auto_apply';
    showSalesPopup?: boolean;
    minConfidence?: number;
    actorName: string;
  }
) {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by_name: input.actorName,
  };
  if (typeof input.enabled === 'boolean') patch.enabled = input.enabled;
  if (input.mode === 'stage_confirm' || input.mode === 'auto_apply') patch.mode = input.mode;
  if (typeof input.showSalesPopup === 'boolean') patch.show_sales_popup = input.showSalesPopup;
  if (typeof input.minConfidence === 'number' && Number.isFinite(input.minConfidence)) {
    patch.min_confidence = Math.min(0.99, Math.max(0.4, input.minConfidence));
  }
  const { error } = await supabase
    .from('messenger_ai_action_rules')
    .update(patch)
    .eq('action_type', input.actionType);
  if (error) throw error;
}

export async function toggleCopilotLesson(supabase: SupabaseClient, lessonId: string, active: boolean) {
  const { error } = await supabase.from('messenger_ai_feedback_lessons').update({ active }).eq('id', lessonId);
  if (error) throw error;
}

export async function deleteCopilotLesson(supabase: SupabaseClient, lessonId: string) {
  const { error } = await supabase.from('messenger_ai_feedback_lessons').delete().eq('id', lessonId);
  if (error) throw error;
}

export async function upsertManualAlias(
  supabase: SupabaseClient,
  input: { phrase: string; productId: string; productName: string }
) {
  const phraseNormalized = input.phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  if (phraseNormalized.length < 2) throw new Error('Alias phrase must be at least 2 characters.');
  const { data: children } = await supabase.from('products').select('id').eq('parent_id', input.productId).limit(1);
  if (children && children.length > 0) throw new Error('Pick a variant, not a main product.');
  const { error } = await supabase.from('messenger_product_aliases').upsert(
    {
      phrase_normalized: phraseNormalized,
      product_id: input.productId,
      product_name: input.productName,
      source: 'manual',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'phrase_normalized' }
  );
  if (error) throw error;
}

export async function deleteCopilotAlias(supabase: SupabaseClient, aliasId: string) {
  const { error } = await supabase.from('messenger_product_aliases').delete().eq('id', aliasId);
  if (error) throw error;
}
