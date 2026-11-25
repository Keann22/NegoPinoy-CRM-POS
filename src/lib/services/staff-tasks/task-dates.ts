/* Deadlines for staff tasks, in Philippine time (UTC+8, no daylight saving). Browser-safe. */
import type { StaffTask } from '@/types/staff-tasks.types';

const PHT_MS = 8 * 3600000;
/** "Today" / "Tomorrow" / a picked date mean by the end of work, 6 PM. */
const END_OF_WORK = '18:00:00';

export type DuePick = 'none' | 'hour' | 'today' | 'tomorrow' | 'threeDays' | 'date';

export function phtDateString(d: Date = new Date()): string {
  return new Date(d.getTime() + PHT_MS).toISOString().slice(0, 10);
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO deadline for a quick pick (null = no deadline). */
export function dueFromPick(pick: DuePick, pickedDate?: string): string | null {
  const now = new Date();
  if (pick === 'none') return null;
  if (pick === 'hour') return new Date(now.getTime() + 3600000).toISOString();
  const today = phtDateString(now);
  if (pick === 'today') {
    const sixPm = new Date(`${today}T${END_OF_WORK}+08:00`);
    // Already past 6 PM: by the end of the day.
    return (sixPm > now ? sixPm : new Date(`${today}T23:59:00+08:00`)).toISOString();
  }
  if (pick === 'tomorrow') return new Date(`${addDays(today, 1)}T${END_OF_WORK}+08:00`).toISOString();
  if (pick === 'threeDays') return new Date(`${addDays(today, 3)}T${END_OF_WORK}+08:00`).toISOString();
  if (!pickedDate) return null;
  return new Date(`${pickedDate}T${END_OF_WORK}+08:00`).toISOString();
}

const timeFmt = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });

/** "today 2:15 PM" / "Nov 21, 2:15 PM" */
export function phtWhen(iso: string): string {
  const d = new Date(iso);
  const day = phtDateString(d) === phtDateString() ? 'today' : dayFmt.format(d);
  return `${day} ${timeFmt.format(d)}`;
}

/** "Late 3h" / "Late 2d" / "Due today 6:00 PM" / "Due Nov 25, 6:00 PM" */
export function dueLabel(dueAt: string): { text: string; late: boolean } {
  const ms = Date.now() - new Date(dueAt).getTime();
  if (ms > 0) {
    const hours = Math.floor(ms / 3600000);
    const text = hours < 1 ? 'Late' : hours < 24 ? `Late ${hours}h` : `Late ${Math.floor(hours / 24)}d`;
    return { text, late: true };
  }
  return { text: `Due ${phtWhen(dueAt)}`, late: false };
}

export function isLate(dueAt: string | null): boolean {
  return !!dueAt && new Date(dueAt).getTime() < Date.now();
}

/** True when staff logged a "Working on it" update today with a note (pauses late pop-up/flag for today only). */
export function isWorkingToday(
  t: Pick<StaffTask, 'status' | 'progress' | 'progressNote' | 'progressAt'>,
  today: string = phtDateString(),
): boolean {
  return t.status === 'open'
    && t.progress === 'working'
    && !!t.progressNote
    && !!t.progressAt
    && phtDateString(new Date(t.progressAt)) === today;
}

/** "Customer hasn't replied": the task comes back after this many hours (like returns and holds). */
export const WAIT_HOURS = 4;

type WaitFields = Pick<StaffTask, 'status' | 'progress' | 'progressAt'>;

/** When a "Customer hasn't replied" task comes back ("Customer replied yet?"), or null. */
export function waitingUntil(t: WaitFields): Date | null {
  if (t.status !== 'open' || t.progress !== 'waiting' || !t.progressAt) return null;
  return new Date(new Date(t.progressAt).getTime() + WAIT_HOURS * 3600000);
}

/** Waiting for the customer and not due back yet: no late flag, no pop-up. */
export function isWaitingNow(t: WaitFields): boolean {
  const until = waitingUntil(t);
  return !!until && until.getTime() > Date.now();
}

/** Waiting for the customer and the 4 hours are up: ask the staff member again. */
export function isWaitingDue(t: WaitFields): boolean {
  const until = waitingUntil(t);
  return !!until && until.getTime() <= Date.now();
}

/** Open, past deadline, not updated with a "Working on it" note today, and not waiting on the customer. */
export function isTaskLate(
  t: Pick<StaffTask, 'status' | 'dueAt' | 'progress' | 'progressNote' | 'progressAt'>,
  today: string = phtDateString(),
): boolean {
  return t.status === 'open' && isLate(t.dueAt) && !isWorkingToday(t, today) && !isWaitingNow(t);
}
