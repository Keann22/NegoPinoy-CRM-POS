/**
 * "Hindi pa ipi-pick" (owner, 2026-11-25): the warehouse says why an order the
 * shelf covers wasn't picked, and its sales agent answers. Table order_pick_skips.
 */

export type PickSkipReason = 'later' | 'other';

export const PICK_SKIP_REASONS: Record<PickSkipReason, { label: string; hint: string }> = {
  later: { label: 'Reserved / ships on a later date', hint: 'Customer or sales asked to ship it later' },
  other: { label: 'Other', hint: 'Something else (write it in the note)' },
};

/** pick_now: sales says pick it; waiting: asked the customer, back in 4 hours. */
export type PickSkipAnswer = 'pick_now' | 'waiting';

export interface PickSkipInfo {
  id: string;
  reason: PickSkipReason;
  note: string | null;
  byName: string | null;
  at: string;
}

/** A pop-up card for the order's sales agent (owners: after 3 days with no answer). */
export interface PickQuestion extends PickSkipInfo {
  orderId: string;
  shortId: string;
  status: string;
  customerName: string;
  salesPersonName: string | null;
  /** Owners see it because sales didn't answer for 3 days. */
  overdue: boolean;
}

/** Picker scan check: this order ships later, don't pick it yet. */
export interface PickDeferral {
  shipOn: string;
  pickFrom: string;
  note: string | null;
}
