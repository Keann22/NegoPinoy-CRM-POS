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

export type PriorityGroup = 'ready' | 'waiting' | 'prep' | 'stale' | 'hold';
export type PriorityOwner = 'warehouse' | 'sales' | 'buyer' | 'none';
export type MissingState = 'decide' | 'buy' | 'in_transit' | 'transit_late' | 'arrived';
export type PriorityStep = 'pack' | 'book' | 'prep' | 'stale' | 'hold' | MissingState;

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
}

export interface PriorityHold {
  until: string;
  note: string | null;
  byName: string | null;
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
  pack: 'Pick, pack & book',
  book: 'Packed — book with SPX',
  decide: 'OS — sales to decide (wait or remove)',
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
const STATE_PRECEDENCE: MissingState[] = ['decide', 'buy', 'transit_late', 'in_transit', 'arrived'];

const STATE_OWNER: Record<MissingState, PriorityOwner> = {
  decide: 'sales',
  buy: 'buyer',
  transit_late: 'buyer',
  in_transit: 'none',
  arrived: 'warehouse',
};

const STATE_DAYS: Record<MissingState, number | null> = {
  decide: PRIORITY_RULES.decideDays,
  buy: PRIORITY_RULES.buyDays,
  transit_late: null, // due = eta
  in_transit: null, // due = eta
  arrived: PRIORITY_RULES.arrivedDays,
};

/** Calendar date (YYYY-MM-DD) in Philippine time. */
export function phtDate(d: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(d));
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
  if (c.group === 'hold' || c.group === 'prep' || c.owner === 'none') return false;
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
