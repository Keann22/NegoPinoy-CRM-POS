import type { SupabaseClient } from '@supabase/supabase-js';
import { COPILOT_MAX_SCAN_ATTEMPTS } from './messenger-context-builder';

/**
 * Claims a burst's messages (sets ai_analyzed_at) before calling the AI, so two scans
 * running together (auto-scan + Scan Recent Chats) can't make duplicate cards.
 * Returns false when another scan already took any of them.
 */
export async function claimBurstLogs(supabase: SupabaseClient, ids: string[]): Promise<boolean> {
  const now = new Date().toISOString();
  const claimed: string[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('conversation_logs')
      .update({ ai_analyzed_at: now })
      .in('id', ids.slice(i, i + 200))
      .is('ai_analyzed_at', null)
      .select('id');
    if (error) throw error;
    claimed.push(...(data ?? []).map((r) => String(r.id)));
  }
  if (claimed.length === ids.length) return true;
  if (claimed.length > 0) {
    await supabase.from('conversation_logs').update({ ai_analyzed_at: null }).in('id', claimed);
  }
  return false;
}

/**
 * Hands a failed burst back for the next scan. countAttempt=false for "out of credits"
 * (not the burst's fault). After COPILOT_MAX_SCAN_ATTEMPTS failures it stays marked, so it
 * stops costing a Gemini call on every scan.
 */
export async function releaseBurstLogs(supabase: SupabaseClient, ids: string[], countAttempt: boolean) {
  if (ids.length === 0) return;
  if (!countAttempt) {
    await supabase.from('conversation_logs').update({ ai_analyzed_at: null }).in('id', ids);
    return;
  }
  const { data } = await supabase.from('conversation_logs').select('id, ai_scan_attempts').in('id', ids);
  const byAttempts = new Map<number, string[]>();
  for (const r of data ?? []) {
    const next = Number(r.ai_scan_attempts || 0) + 1;
    byAttempts.set(next, [...(byAttempts.get(next) || []), String(r.id)]);
  }
  for (const [attempts, rowIds] of byAttempts) {
    await supabase
      .from('conversation_logs')
      .update({
        ai_scan_attempts: attempts,
        ai_analyzed_at: attempts >= COPILOT_MAX_SCAN_ATTEMPTS ? new Date().toISOString() : null,
      })
      .in('id', rowIds);
  }
}
