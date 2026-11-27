/**
 * "Not for shipping yet" holds (owner, 2026-11-24, phase 2): sales pick why an
 * order waits, when to ask again, and which orders ship together.
 * Table order_ship_holds; the text stays in orders.not_for_shipping_reason.
 */

export type ShipHoldKind = 'with_orders' | 'payment' | 'adding' | 'date' | 'other';
export type ShipVia = 'courier' | 'bus';

export const SHIP_HOLD_KINDS: Record<ShipHoldKind, { label: string; hint: string }> = {
  with_orders: { label: 'Ship with other orders', hint: 'Ship together with the customer’s other orders' },
  payment: { label: 'Waiting for payment', hint: 'Waiting for the customer to pay' },
  adding: { label: 'Customer will add more', hint: 'Customer will add more items' },
  date: { label: 'Ship on a date', hint: 'Customer asked to ship on a date' },
  other: { label: 'Other', hint: 'Something else (write it in the note)' },
};

export const SHIP_HOLD_KIND_ORDER: ShipHoldKind[] = ['with_orders', 'payment', 'adding', 'date', 'other'];

/** One order in a hold group, as the pop-up and Priority List show it. */
export interface ShipHoldOrder {
  id: string;
  shortId: string;
  status: string;
  balanceDue: number;
  amountPaid?: number;
  paymentMethod: string | null;
  /** Packed and paid enough to go (COD counts as unpaid when going by bus). */
  ready: boolean;
  /** Why it isn't ready: "not packed yet", "₱691.85 balance". */
  waitingFor: string | null;
}

/** The structured part of a hold (null for an old free-text hold not converted yet). */
export interface ShipHoldDetail {
  id: string;
  kind: ShipHoldKind;
  shipVia: ShipVia;
  note: string | null;
  /** YYYY-MM-DD (Philippine date) when sales is asked "Ready na ba?". */
  checkOn: string;
  groupId: string | null;
  /** Every order in the group, this one included (just this one when not grouped). */
  orders: ShipHoldOrder[];
  /** Ship-together group complete, or the payment it waited for came in. */
  complete: boolean;
}

export interface NewShipHold {
  orderId: string;
  kind: ShipHoldKind;
  note: string;
  checkOn: string;
  shipVia: ShipVia;
  /** Other orders of the same customer that ship with this one (kind with_orders). */
  withOrderIds: string[];
  /** Open regular tasks on this order to mark Done when the hold is saved. */
  closeTaskIds?: string[];
}

/** A pop-up card for the order's sales agent (owners: after 3 days with no answer). */
export interface ShipHoldPrompt {
  /** Hold id of the group's first order; answers apply to the whole group. */
  id: string;
  /** complete: "Kumpleto na / Bayad na, pwede na ipadala"; check: "Ready na ba?" */
  reason: 'complete' | 'check';
  detail: ShipHoldDetail;
  customerName: string;
  salesPersonName: string | null;
  heldByName: string | null;
  heldSince: string;
  /** The text on the order (old free-text holds show what sales wrote). */
  holdText: string | null;
  /** Owners see it because sales didn't answer for 3 days. */
  overdue: boolean;
}

/** Ready = release (goes to Ready to ship); not_yet = ask again on a date; waiting = asked customer, back in 4 hours. */
export type ShipHoldAnswer = 'release' | 'not_yet' | 'waiting';

/** For the hold dialog: the order, its current hold, and the customer's other open orders. */
export interface ShipHoldFormData {
  orderId: string;
  shortId: string;
  status: string;
  customerName: string;
  holdText: string | null;
  hold: ShipHoldDetail | null;
  others: { id: string; shortId: string; status: string; balanceDue: number; paymentMethod: string | null }[];
  /** `mine`: assigned to the caller (starts ticked); other people's tasks start unticked. */
  openTasks?: { id: string; message: string; assigneeName: string; mine?: boolean }[];
}
