import type { ShipHoldKind, ShipHoldOrder, ShipVia } from '@/types/ship-holds.types';

/*
 * When is a held order (or a ship-together group) ready to go? Pure rules,
 * shared by the pop-up, the Priority List and the hold dialog.
 */

/** Orders not shipped, delivered or cancelled yet. */
export const OPEN_ORDER_STATUSES = [
  'Pending Payment', 'Processing', 'Picked', 'Picked (with issue)', 'Photo',
  'Packed', 'For Shipping', 'On-Hold', 'Waiting for Stock',
];
export const shortOrderId = (id: string) => `#${id.slice(0, 7).toUpperCase()}`;

export const PACKED_STATUSES = ['Packed', 'For Shipping'];
/** Courier collects these on delivery (installments ship before they're paid off). */
const COLLECTED_ON_DELIVERY = ['COD', 'Installment'];
/** Days of no answer before the owners see the "Ready to ship?" card too. */
export const OWNER_AFTER_DAYS = 3;
export const DEFAULT_CHECK_DAYS = 7;
export const ASK_AGAIN_HOURS = 4;

const peso = (n: number) => {
  const cents = Math.round(n * 100) % 100 !== 0;
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
};

/**
 * Paid enough to send: no balance, or the courier collects it (COD by courier).
 * A bus doesn't collect COD, so by bus everything must be paid first.
 */
export function paidEnough(o: { balanceDue: number; paymentMethod: string | null }, via: ShipVia): boolean {
  if (o.balanceDue < 1) return true;
  return via === 'courier' && COLLECTED_ON_DELIVERY.includes(o.paymentMethod || '');
}

export function orderReadiness(
  o: { status: string; balanceDue: number; paymentMethod: string | null },
  via: ShipVia,
): Pick<ShipHoldOrder, 'ready' | 'waitingFor'> {
  const waiting: string[] = [];
  if (!PACKED_STATUSES.includes(o.status)) waiting.push(`not packed yet (${o.status})`);
  if (!paidEnough(o, via)) waiting.push(`${peso(o.balanceDue)} balance${o.paymentMethod === 'COD' ? ' (COD)' : ''}`);
  return { ready: waiting.length === 0, waitingFor: waiting.length ? waiting.join(', ') : null };
}

/**
 * Ship together: every order packed and paid enough. Waiting for payment: every
 * order paid. Other reasons (will add more, a date) have no automatic "done":
 * sales is asked on the check-again date.
 */
export function holdComplete(kind: ShipHoldKind, orders: ShipHoldOrder[], via: ShipVia): boolean {
  if (orders.length === 0) return false;
  if (kind === 'with_orders') return orders.every((o) => o.ready);
  if (kind === 'payment') return orders.every((o) => paidEnough(o, via) && o.balanceDue < 1);
  return false;
}

/** Today's date in the Philippines, YYYY-MM-DD. */
export function phtToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
}

export function addDaysPht(days: number, now = new Date()): string {
  return phtToday(new Date(now.getTime() + days * 86400000));
}

/**
 * Ship later (owner, 2026-11-25): we run lean, so an order the customer wants
 * shipped on a later date isn't picked yet. Until a few days before that date
 * the shelf pieces stay free for other orders and it isn't bought for.
 */
export const PICK_LEAD_DAYS = 3;
/** Orders with pieces still to take off the shelf. */
export const NOT_PICKED_STATUSES = ['Pending Payment', 'Processing', 'Waiting for Stock', 'On-Hold', 'Picked (with issue)'];

/** The day picking starts for an order that ships on `shipOn` (YYYY-MM-DD). */
export function pickStartsOn(shipOn: string): string {
  return phtToday(new Date(new Date(`${shipOn}T12:00:00+08:00`).getTime() - PICK_LEAD_DAYS * 86400000));
}

/** A "ship on a date" hold on an order not picked yet, and it's too early to pick. */
export function isPickDeferred(
  hold: { kind: string; checkOn: string } | null | undefined, status: string, today = phtToday(),
): boolean {
  return !!hold && hold.kind === 'date' && NOT_PICKED_STATUSES.includes(status) && today < pickStartsOn(hold.checkOn);
}

/** Short label like "Nov 30". */
export function shortPhtDate(ymd: string): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })
    .format(new Date(`${ymd}T12:00:00+08:00`));
}
