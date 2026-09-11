import { SupabaseClient } from '@supabase/supabase-js';
import type { GuardianDailyProgress, CompletedDailyAuditItem } from '@/types';

const BASE_DAILY_TARGET = 5;
const MAX_CARRYOVER = 15; // Cap carry-over so the daily queue never exceeds 20 items
const TRACKING_START_DATE = '2026-09-11'; // Daily goal launched on Sept 11, 2026

/**
 * Computes the historical carry-over of unfinished audit items from previous working days.
 * - Daily base target: 5 items.
 * - Sunday is a rest day (not a working day, zero quota, no audits expected).
 * - Any unfinished quota from a working day carries over to the next working day
 *   (e.g., Friday's deficit carries over to Saturday, Saturday's deficit carries over to Monday).
 */
export async function computeGuardianDailyTarget(
  supabase: SupabaseClient,
  phTodayStr: string,
  isSunday: boolean
): Promise<{ baseTarget: number; carryOver: number; target: number }> {
  if (isSunday) {
    return {
      baseTarget: BASE_DAILY_TARGET,
      carryOver: 0,
      target: 0
    };
  }

  let carryOver = 0;

  try {
    const todayMidnightUtc = new Date(`${phTodayStr}T00:00:00+08:00`).toISOString();
    const trackingStartUtc = new Date(`${TRACKING_START_DATE}T00:00:00+08:00`).toISOString();

    // Only query past days if today is after tracking start date
    if (phTodayStr > TRACKING_START_DATE) {
      const { data: pastMemories, error } = await supabase
        .from('inventory_guardian_memory')
        .select('product_id, created_at')
        .in('action_type', ['physical_count_audit', 'purchase_backfill'])
        .gte('created_at', trackingStartUtc)
        .lt('created_at', todayMidnightUtc);

      if (error) {
        console.error('Error querying past guardian memory for carryover:', error);
      }

      // Group unique products audited by Philippine date string
      const uniqueAuditsByDate = new Map<string, Set<string>>();

      for (const m of (pastMemories || []) as any[]) {
        if (!m.product_id || !m.created_at) continue;
        const auditPhDate = new Date(new Date(m.created_at).getTime() + 8 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        if (!uniqueAuditsByDate.has(auditPhDate)) {
          uniqueAuditsByDate.set(auditPhDate, new Set());
        }
        uniqueAuditsByDate.get(auditPhDate)!.add(m.product_id);
      }

      // Walk day-by-day from TRACKING_START_DATE up to yesterday
      const startMs = new Date(`${TRACKING_START_DATE}T00:00:00+08:00`).getTime();
      const endMs = new Date(`${phTodayStr}T00:00:00+08:00`).getTime();
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;

      for (let cursorMs = startMs; cursorMs < endMs; cursorMs += ONE_DAY_MS) {
        const cursorPhDate = new Date(cursorMs + 8 * 60 * 60 * 1000);
        const dayOfWeek = cursorPhDate.getUTCDay();

        // Skip Sundays (rest day, no quota)
        if (dayOfWeek === 0) continue;

        const dateStr = cursorPhDate.toISOString().slice(0, 10);
        const dayTarget = BASE_DAILY_TARGET + carryOver;
        const completedCount = uniqueAuditsByDate.get(dateStr)?.size || 0;
        const shortfall = Math.max(0, dayTarget - completedCount);

        carryOver = Math.min(MAX_CARRYOVER, shortfall);
      }
    }
  } catch (err) {
    console.error('Error computing guardian carryover:', err);
  }

  return {
    baseTarget: BASE_DAILY_TARGET,
    carryOver,
    target: BASE_DAILY_TARGET + carryOver
  };
}

/**
 * Computes today's progress towards the progressive physical audit goal,
 * incorporating carry-over from previous working days and Sunday rest day rules.
 */
export async function getGuardianDailyProgress(
  supabase: SupabaseClient,
  totalBacklogCount: number
): Promise<GuardianDailyProgress> {
  const now = new Date();
  const phNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const phDateStr = phNow.toISOString().slice(0, 10);
  const dayOfWeek = phNow.getUTCDay(); // 0 = Sunday
  const isSunday = dayOfWeek === 0;

  const { baseTarget, carryOver, target } = await computeGuardianDailyTarget(
    supabase,
    phDateStr,
    isSunday
  );

  try {
    const todayMidnightUtc = new Date(`${phDateStr}T00:00:00+08:00`).toISOString();

    const { data: todayMemories, error } = await supabase
      .from('inventory_guardian_memory')
      .select('id, product_id, action_type, physical_count, actor_name, created_at, products(name)')
      .in('action_type', ['physical_count_audit', 'purchase_backfill'])
      .gte('created_at', todayMidnightUtc)
      .order('created_at', { ascending: false });

    if (error || !todayMemories) {
      return {
        baseTarget,
        carryOver,
        target,
        completedToday: 0,
        remainingToday: target,
        isGoalMet: isSunday,
        isRestDay: isSunday,
        completedItems: [],
        totalBacklogCount
      };
    }

    // Deduplicate by product_id so multiple audits of the same product count as 1
    const seenProductIds = new Set<string>();
    const completedItems: CompletedDailyAuditItem[] = [];

    for (const m of todayMemories as any[]) {
      if (!m.product_id || seenProductIds.has(m.product_id)) continue;
      seenProductIds.add(m.product_id);
      completedItems.push({
        id: m.id,
        productId: m.product_id,
        productName: m.products?.name || 'Unknown Product',
        actorName: m.actor_name || 'Staff',
        actionType: m.action_type,
        physicalCount: m.physical_count,
        timestamp: m.created_at
      });
    }

    const completedToday = completedItems.length;
    const remainingToday = Math.max(0, target - completedToday);

    return {
      baseTarget,
      carryOver,
      target,
      completedToday,
      remainingToday,
      isGoalMet: isSunday || completedToday >= target,
      isRestDay: isSunday,
      completedItems,
      totalBacklogCount
    };
  } catch (err) {
    console.error('Error fetching guardian daily progress:', err);
    return {
      baseTarget,
      carryOver,
      target,
      completedToday: 0,
      remainingToday: target,
      isGoalMet: isSunday,
      isRestDay: isSunday,
      completedItems: [],
      totalBacklogCount
    };
  }
}
