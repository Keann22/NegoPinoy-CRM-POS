import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CustomerReturnError,
  logEvent,
  notifyNames,
  notifyOwners,
  shortOrder,
  todayPh,
} from './customer-return-service';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Formats a PH calendar date (YYYY-MM-DD) as e.g. "Dec 3". */
export function formatHoldDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });
}

/** Pauses an open return case until `holdUntil` (YYYY-MM-DD in PH time). */
export async function holdReturnCase(
  supabase: SupabaseClient,
  r: any,
  holdUntil: string,
  note: string | undefined,
  actorName: string
) {
  const ymd = (holdUntil || '').trim();
  if (!YMD_RE.test(ymd)) throw new CustomerReturnError('Pick a valid date to hold until.');
  const today = todayPh();
  if (ymd <= today) throw new CustomerReturnError('Pick a future date (tomorrow or later).');

  const now = new Date().toISOString();
  const cleanNote = note?.trim() || null;
  const { data, error } = await supabase
    .from('customer_returns')
    .update({
      hold_until: ymd,
      hold_note: cleanNote,
      hold_by_name: actorName,
      hold_set_at: now,
      hold_reminded_at: null,
      updated_at: now,
    })
    .eq('id', r.id)
    .eq('updated_at', r.updated_at)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new CustomerReturnError('Someone else just changed this case. Refresh and try again.');

  const detail = [`Until ${formatHoldDate(ymd)}`, cleanNote].filter(Boolean).join(' · ');
  await logEvent(supabase, r.id, 'held', actorName, detail);
}

/** Takes a held return case off hold immediately so it returns to its active stage. */
export async function resumeHeldReturn(supabase: SupabaseClient, r: any, actorName: string) {
  if (!r.hold_until) return;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('customer_returns')
    .update({
      hold_until: null,
      hold_note: null,
      hold_by_name: null,
      hold_set_at: null,
      hold_reminded_at: null,
      updated_at: now,
    })
    .eq('id', r.id)
    .eq('updated_at', r.updated_at)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new CustomerReturnError('Someone else just changed this case. Refresh and try again.');

  await logEvent(supabase, r.id, 'hold_resumed', actorName);
}

/**
 * Finds open return cases whose `hold_until` date has arrived (<= today in PH time)
 * and haven't been reminded yet. Atomically marks `hold_reminded_at` so each hold
 * notifies at most once, logs a `hold_ended` event, and sends bell notifications to
 * owners, the sales agent, and whoever placed the hold.
 */
export async function wakeDueHeldReturns(supabase: SupabaseClient, now = Date.now()): Promise<{ woke: number }> {
  const today = todayPh(now);
  const { data: due, error } = await supabase
    .from('customer_returns')
    .select('id, case_no, order_id, hold_until, hold_note, hold_by_name, orders!customer_returns_order_id_fkey(sales_person_name, customers(full_name))')
    .eq('status', 'open')
    .not('hold_until', 'is', null)
    .lte('hold_until', today)
    .is('hold_reminded_at', null);
  if (error || !due || due.length === 0) return { woke: 0 };

  const stamp = new Date(now).toISOString();
  let woke = 0;

  for (const r of due as any[]) {
    const { data: claimed } = await supabase
      .from('customer_returns')
      .update({ hold_reminded_at: stamp, updated_at: stamp })
      .eq('id', r.id)
      .is('hold_reminded_at', null)
      .select('id');
    if (!claimed || claimed.length === 0) continue;

    woke++;
    const customer = r.orders?.customers?.full_name || 'Customer';
    const untilLabel = formatHoldDate(r.hold_until);
    const title = `Return #${r.case_no}: hold ended (${untilLabel})`;
    const msg = `#${shortOrder(r.order_id)} ${customer} is back in To do.${r.hold_note ? ` “${r.hold_note}”` : ''}`;

    await logEvent(supabase, r.id, 'hold_ended', 'System', [`Hold until ${untilLabel} ended`, r.hold_note].filter(Boolean).join(' · '));
    await notifyOwners(supabase, title, msg);

    const extra = Array.from(new Set([r.orders?.sales_person_name, r.hold_by_name].filter(Boolean) as string[]));
    if (extra.length > 0) {
      await notifyNames(supabase, extra, title, msg);
    }
  }

  return { woke };
}
