/**
 * Priority list rules: which group an order is in, who owns its next step,
 * when that step is due, and its rank score. Pure functions — the data comes
 * from priority-list-service.ts.
 *
 * Each order is judged by what is blocking it right now, not by one fixed
 * "days since payment" rule: a China item in transit isn't late, but an OS
 * item nobody decided on for days is.
 */

const DAY = 24 * 60 * 60 * 1000;

export const PRIORITY_RULES = {
  /** Paid and everything in stock: booked within this many days of full payment. */
  packDays: 2,
  /** Packed: booked (SPX Excel sync → For Pick-up) within this many days. */
  bookDays: 1,
  /** OS with no buy request: sales decides (wait / remove) within this many days. */
  decideDays: 1,
  /** Buy request made: bought within this many days. */
  buyDays: 2,
  /** Bought with no tracked arrival date (local supplier): expected in this many days. */
  untrackedTransitDays: 3,
  /** Bought item arrived: re-picked and booked within this many days. */
  arrivedDays: 1,
  /** Lay-aways at least this share paid show up early as "Prep now". */
  prepPaidRatio: 0.8,
  /** No order activity (edits, picks, payments, follow-ups) for this many days: sales confirms with the customer or cancels. */
  staleDays: 30,
  points: {
    perDayLate: 15,
    perFollowUp: 30,
    maxFollowUps: 3,
    perDayPaid: 5,
    layawayDone: 15,
    value5k: 10,
    value10k: 20,
    perExtraOsRound: 10,
  },
};

/**
 * "Send today": sales and the jas accounts mark orders that must go out today.
 * Courier pickup is at 2 PM, and "sent" means booked (the SPX Excel sync moves
 * the order to For Pick-up), so the warehouse gets reminders through the late
 * morning. Marks made after the cutoff go on tomorrow's list unless an admin or
 * jas overrides.
 */
export const SEND_TODAY = {
  cutoffHour: 11,
  pickupHour: 14,
  /** Reminder times (PHT, 24h) for the warehouse pop-up. */
  reminders: ['11:30', '12:30', '13:15', '13:45'],
  /** From this reminder on, the pop-up is the final warning. */
  finalReminder: '13:45',
};

/** The jas accounts (same people who approve prices): can mark and override the cutoff. */
export const JAS_EMAILS = ['jas@gmail.com', 'jas@usares.com'];

export const BLOCK_REASONS = {
  item_os: 'Item is OS',
  customer_hold: 'Customer asked to hold',
  payment_check: 'Payment needs checking',
  other: 'Other',
} as const;
export type BlockReason = keyof typeof BLOCK_REASONS;

export type PriorityGroup = 'send_today' | 'ready' | 'waiting' | 'prep' | 'stale' | 'hold';
export type PriorityOwner = 'warehouse' | 'sales' | 'buyer' | 'none';
export type MissingState = 'decide' | 'remove_item' | 'buy' | 'in_transit' | 'transit_late' | 'arrived';

/** Sales' answer for an OS item. */
export const OS_DECISIONS = {
  wait: 'Customer will wait',
  carry_over: 'Send the rest now — item to follow',
  remove: 'Remove the item (customer cancelled it)',
} as const;
export type OsDecision = keyof typeof OS_DECISIONS;
export type PriorityStep = 'send_today' | 'send_upload' | 'pack' | 'book' | 'prep' | 'stale' | 'hold' | MissingState;

export interface MissingItem {
  productId: string;
  name: string;
  qty: number;
  state: MissingState;
  /** When this item's current state started (OS scan, request, or receipt). */
  since: string;
  /** Expected arrival for bought items (tracked ETA or the untracked default). */
  eta: string | null;
  /** Online order stage label, when tracked. */
  stageLabel: string | null;
  /** Sales' latest decision for this item on this order. */
  decision: { kind: OsDecision; note: string | null; byName: string | null; at: string } | null;
}

export interface PriorityHold {
  until: string;
  note: string | null;
  byName: string | null;
}

export interface SendTodayMark {
  /** The day it must be booked (YYYY-MM-DD, PHT). */
  date: string;
  note: string | null;
  byName: string | null;
  at: string;
}

export interface SendTodayBlock {
  reason: BlockReason;
  note: string | null;
  byName: string | null;
  at: string;
}

export interface PriorityOrderInput {
  id: string;
  status: string;
  paymentMethod: string | null;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  orderDate: string;
  packedAt: string | null;
  /** Latest edit, pick, payment, OS scan or follow-up on the order. */
  lastActivityAt: string | null;
  salesPersonName: string | null;
  customerName: string | null;
  /** When the order became fully paid (COD: when ordered). Null if still owing. */
  paidAt: string | null;
  missing: MissingItem[];
  osRounds: number;
  followUps: number;
  lastFollowUp: { note: string | null; byName: string | null; at: string } | null;
  hold: PriorityHold | null;
  /** Active send-today mark (latest send_today* event is a mark). */
  sendToday: SendTodayMark | null;
  /** The warehouse said it can't send this today (latest send_today* event, today only). */
  sendTodayBlock: SendTodayBlock | null;
}

export interface ScorePart {
  label: string;
  points: number;
}

export interface PriorityRow extends PriorityOrderInput {
  group: PriorityGroup;
  owner: PriorityOwner;
  step: PriorityStep;
  stepSince: string | null;
  dueAt: string | null;
  daysLate: number;
  daysSincePaid: number | null;
  score: number;
  scoreParts: ScorePart[];
}

export const STEP_LABELS: Record<PriorityStep, string> = {
  send_today: 'Send today — pick, pack & book before 2 PM',
  send_upload: 'Send today — packed, waiting for SPX upload',
  pack: 'Pick, pack & book',
  book: 'Packed — book with SPX',
  decide: 'OS — sales to decide (wait, send the rest, or remove)',
  remove_item: 'Decided — sales to remove the item from the order (Edit order)',
  buy: 'OS — to buy',
  in_transit: 'Bought — waiting for delivery',
  transit_late: 'Bought — delivery is late',
  arrived: 'Item arrived — re-pick & book',
  prep: 'Prep now — check stock before final payment',
  stale: 'No activity 30+ days — confirm with customer or cancel',
  hold: 'On hold',
};

export const OWNER_LABELS: Record<PriorityOwner, string> = {
  warehouse: 'Warehouse',
  sales: 'Sales',
  buyer: 'Buyer',
  none: 'Waiting',
};

/** Which blocked item decides the order's next step, most urgent first. */
const STATE_PRECEDENCE: MissingState[] = ['decide', 'remove_item', 'buy', 'transit_late', 'in_transit', 'arrived'];

const STATE_OWNER: Record<MissingState, PriorityOwner> = {
  decide: 'sales',
  remove_item: 'sales',
  buy: 'buyer',
  transit_late: 'buyer',
  in_transit: 'none',
  arrived: 'warehouse',
};

const STATE_DAYS: Record<MissingState, number | null> = {
  decide: PRIORITY_RULES.decideDays,
  remove_item: PRIORITY_RULES.decideDays,
  buy: PRIORITY_RULES.buyDays,
  transit_late: null, // due = eta
  in_transit: null, // due = eta
  arrived: PRIORITY_RULES.arrivedDays,
};

/** Calendar date (YYYY-MM-DD) in Philippine time. */
export function phtDate(d: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(d));
}

/** Hour of the day (0-23) in Philippine time. */
export function phtHour(d: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }).format(d)) % 24;
}

/** "HH:MM" in Philippine time. */
export function phtClock(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/** Which day a new send-today mark lands on: today before the cutoff, else tomorrow (unless overridden). */
export function sendDateFor(now: Date, override: boolean): string {
  if (override || phtHour(now) < SEND_TODAY.cutoffHour) return phtDate(now);
  return phtDate(new Date(now.getTime() + DAY));
}

/** Pickup time on a send day, as an ISO timestamp. */
export function pickupAt(date: string): string {
  return new Date(`${date}T${String(SEND_TODAY.pickupHour).padStart(2, '0')}:00:00+08:00`).toISOString();
}

/** The reminder period we're in ('start' before the first reminder). Each period pops the reminder once. */
export function reminderSlot(now: Date): string {
  const clock = phtClock(now);
  return [...SEND_TODAY.reminders].reverse().find((r) => clock >= r) || 'start';
}

/** Bought-item state from its purchase line. */
export function transitState(eta: string | null, now: Date): MissingState {
  if (!eta) return 'in_transit';
  return phtDate(now) > phtDate(eta) ? 'transit_late' : 'in_transit';
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY).toISOString();
}

function earliest(dates: string[]): string | null {
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
}

/** Whole days late, counting any part of a day past the deadline as one. */
function daysLateFor(dueAt: string | null, now: Date): number {
  if (!dueAt) return 0;
  const over = now.getTime() - new Date(dueAt).getTime();
  return over > 0 ? Math.ceil(over / DAY) : 0;
}

export function isHoldActive(hold: PriorityHold | null, now: Date): boolean {
  return !!hold && hold.until >= phtDate(now);
}

function classify(o: PriorityOrderInput, now: Date) {
  if (o.status === 'On-Hold' || isHoldActive(o.hold, now)) {
    return { group: 'hold' as const, owner: 'none' as const, step: 'hold' as const, stepSince: null, dueAt: null };
  }

  if (o.sendToday && o.sendToday.date <= phtDate(now)) {
    const step = ['Packed', 'For Shipping'].includes(o.status) ? 'send_upload' as const : 'send_today' as const;
    return { group: 'send_today' as const, owner: 'warehouse' as const, step, stepSince: o.sendToday.at, dueAt: pickupAt(o.sendToday.date) };
  }

  if (!o.paidAt) {
    return { group: 'prep' as const, owner: 'warehouse' as const, step: 'prep' as const, stepSince: null, dueAt: null };
  }

  if (o.missing.length > 0) {
    const state = STATE_PRECEDENCE.find((s) => o.missing.some((m) => m.state === s))!;
    const items = o.missing.filter((m) => m.state === state);
    const stepSince = earliest(items.map((m) => m.since));
    const days = STATE_DAYS[state];
    const dueAt = days == null ? earliest(items.map((m) => m.eta).filter(Boolean) as string[]) : stepSince && addDays(stepSince, days);
    return { group: 'waiting' as const, owner: STATE_OWNER[state], step: state, stepSince, dueAt };
  }

  if (['Packed', 'For Shipping'].includes(o.status)) {
    const stepSince = o.packedAt || o.paidAt;
    return { group: 'ready' as const, owner: 'warehouse' as const, step: 'book' as const, stepSince, dueAt: addDays(stepSince, PRIORITY_RULES.bookDays) };
  }

  return { group: 'ready' as const, owner: 'warehouse' as const, step: 'pack' as const, stepSince: o.paidAt, dueAt: addDays(o.paidAt, PRIORITY_RULES.packDays) };
}

function scoreFor(o: PriorityOrderInput, daysLate: number, daysSincePaid: number | null): ScorePart[] {
  const p = PRIORITY_RULES.points;
  const parts: ScorePart[] = [];
  if (daysLate > 0) parts.push({ label: `${daysLate} day${daysLate === 1 ? '' : 's'} late on this step`, points: daysLate * p.perDayLate });
  const followUps = Math.min(o.followUps, p.maxFollowUps);
  if (followUps > 0) parts.push({ label: `Customer followed up ${o.followUps}×`, points: followUps * p.perFollowUp });
  if (daysSincePaid && daysSincePaid > 0) {
    const label = o.paymentMethod === 'COD' ? 'ordered' : 'fully paid';
    parts.push({ label: `${daysSincePaid} day${daysSincePaid === 1 ? '' : 's'} since ${label}`, points: daysSincePaid * p.perDayPaid });
  }
  if (o.paymentMethod === 'Lay-away' && o.paidAt) parts.push({ label: 'Lay-away completed', points: p.layawayDone });
  if (o.totalAmount >= 10000) parts.push({ label: 'Order ₱10k+', points: p.value10k });
  else if (o.totalAmount >= 5000) parts.push({ label: 'Order ₱5k+', points: p.value5k });
  if (o.osRounds > 1) parts.push({ label: `Picked ${o.osRounds}× with OS`, points: (o.osRounds - 1) * p.perExtraOsRound });
  return parts;
}

/** Forgotten orders go to their own tab so they don't bury today's work. */
function isStale(o: PriorityOrderInput, c: ReturnType<typeof classify>, now: Date): boolean {
  if (c.group === 'send_today' || c.group === 'hold' || c.group === 'prep' || c.owner === 'none') return false;
  const last = o.lastActivityAt || o.orderDate;
  return now.getTime() - new Date(last).getTime() > PRIORITY_RULES.staleDays * DAY;
}

export function rankOrder(o: PriorityOrderInput, now: Date): PriorityRow {
  const classified = classify(o, now);
  const c = isStale(o, classified, now)
    ? { ...classified, group: 'stale' as const, owner: 'sales' as const, step: 'stale' as const }
    : classified;
  const daysLate = c.group === 'hold' ? 0 : daysLateFor(c.dueAt, now);
  const daysSincePaid = o.paidAt ? Math.floor((now.getTime() - new Date(o.paidAt).getTime()) / DAY) : null;
  const scoreParts = scoreFor(o, daysLate, daysSincePaid);
  const score = scoreParts.reduce((s, part) => s + part.points, 0);
  return { ...o, ...c, daysLate, daysSincePaid, score, scoreParts };
}

/** Highest score first; ties go to whoever has waited longest since payment. */
export function compareRows(a: PriorityRow, b: PriorityRow): number {
  if (b.score !== a.score) return b.score - a.score;
  return (a.paidAt || a.orderDate).localeCompare(b.paidAt || b.orderDate);
}
