// Customer Returns: RTS parcels, damage reports and items customers ship back.
// See architecture.md "Planned: Customer Returns" and docs/BUSINESS_WORKFLOW.md.

export type CustomerReturnSource = 'rts' | 'damage_report' | 'shipped_back';

export type CustomerReturnOutcome =
  | 'reship'
  | 'replacement'
  | 'full_refund'
  | 'partial_refund'
  | 'store_credit'
  | 'cancel_order'
  | 'no_action';

export type DamagedAction = 'throw_away' | 'second_hand' | 'never_came_back';

/** Where the case is now; one per case, in the order the work happens. */
export type CustomerReturnStage = 'needs_sales' | 'needs_owner' | 'to_check' | 'to_do' | 'waiting_parcel' | 'done';

export const CR_SOURCE_LABELS: Record<CustomerReturnSource, string> = {
  rts: 'Courier sent it back (RTS)',
  damage_report: 'Customer reported damage',
  shipped_back: 'Customer is shipping it back',
};

export const CR_RETURN_REASONS: Record<CustomerReturnSource, readonly string[]> = {
  rts: ['Failed delivery', 'Rejected by recipient', 'Customer cancelled', 'Other'],
  damage_report: ['Damaged in transit', 'Defective / not working', 'Wrong item', 'Missing item or part', 'Other'],
  shipped_back: ['Damaged in transit', 'Defective / not working', 'Wrong item', 'Changed mind', 'Other'],
};

export const CR_OUTCOME_LABELS: Record<CustomerReturnOutcome, string> = {
  reship: 'Re-ship the order',
  replacement: 'Send a replacement',
  full_refund: 'Full refund',
  partial_refund: 'Partial refund / discount (customer keeps it)',
  store_credit: 'Store credit',
  cancel_order: 'Cancel the order',
  no_action: 'Nothing to give',
};

/** The step someone still has to carry out after the decision (null = nothing). */
export const CR_OUTCOME_TODO: Record<CustomerReturnOutcome, { label: string; ownerOnly: boolean } | null> = {
  reship: { label: 'Send back to For Shipping', ownerOnly: false },
  replacement: { label: 'Create replacement order', ownerOnly: false },
  full_refund: { label: 'Refund sent', ownerOnly: true },
  partial_refund: { label: 'Refund / discount sent', ownerOnly: true },
  store_credit: { label: 'Give store credit', ownerOnly: true },
  cancel_order: null,
  no_action: null,
};

export type ShippingPayer = 'us' | 'customer';

export const CR_SHIPPING_PAYER_LABELS: Record<ShippingPayer, string> = {
  us: 'We pay shipping (free shipping)',
  customer: 'Customer pays shipping (SF only)',
};

export const CR_REFUND_METHODS = ['GCash', 'Bank Transfer', 'Cash', 'Maya'] as const;

/**
 * Partial refund without money going back: the customer keeps the damaged item and
 * stops paying the rest (owner, 2026-11-05). Taken off the order as a discount.
 */
export const CR_WAIVE_METHOD = 'Waived balance';

/** Expense categories for refunds. A full refund's sale is already removed from P&L (order is Returned), so P&L skips that one. */
export const REFUND_EXPENSE_CATEGORY = 'Customer Refund';
export const REFUND_VOIDED_SALE_EXPENSE_CATEGORY = 'Customer Refund (returned order)';

export const CR_DAMAGED_ACTION_LABELS: Record<DamagedAction, string> = {
  throw_away: 'Thrown away',
  second_hand: 'Keep to sell as 2nd-hand',
  never_came_back: 'Never came back',
};

export const CR_STAGE_LABELS: Record<CustomerReturnStage, string> = {
  needs_sales: 'Needs sales',
  needs_owner: 'Needs owner',
  to_check: 'To check',
  to_do: 'To do',
  waiting_parcel: 'Waiting for parcel',
  done: 'Done',
};

export interface CustomerReturnItem {
  id: string;
  orderItemId: string | null;
  productId: string | null;
  productName: string;
  qty: number;
  goodQty: number;
  damagedQty: number;
  damagedAction: DamagedAction | null;
}

export interface CustomerReturnEvent {
  id: string;
  event: string;
  note: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface CustomerReturn {
  id: string;
  caseNo: number;
  orderId: string;
  orderStatus: string | null;
  /** What the customer still owes on the order (for waiving it). */
  orderBalance: number | null;
  customerName: string;
  salesPersonName: string | null;
  source: CustomerReturnSource;
  reason: string;
  notes: string | null;
  photoUrls: string[];
  status: 'open' | 'closed';
  stage: CustomerReturnStage;
  openedByName: string | null;
  createdAt: string;
  outcome: CustomerReturnOutcome | null;
  askBack: boolean;
  replacementTiming: 'now' | 'after_arrival' | null;
  amount: number;
  courierClaim: boolean;
  decisionNote: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  arrivedAt: string | null;
  checkedAt: string | null;
  checkedByName: string | null;
  restockedAt: string | null;
  outcomeDoneAt: string | null;
  outcomeDoneNote: string | null;
  closedAt: string | null;
  shippingPayer: ShippingPayer | null;
  replacementOrderId: string | null;
  refundMethod: string | null;
  refundReference: string | null;
  creditGiven: number;
  /** Courier return: sales said they asked the customer and are waiting for a reply. */
  waitingCustomerAt: string | null;
  waitingCustomerByName: string | null;
  /** When the resend/cancel pop-up asks again (null = now). */
  askAgainAt: string | null;
  /** Courier return still undecided after 3 days: the owners decide now. */
  escalated: boolean;
  /** Checked and decided, OK pieces still to be put back on the shelf. */
  needsShelving: boolean;
  /** Only some boxes of a multi-box order came back (the order isn't voided). */
  partial: boolean;
  /** Which box(es) came back, e.g. "Box 2". */
  boxNames: string | null;
  daysOpen: number;
  isOverdue: boolean;
  /** Checked, has damaged pieces, and the owners haven't said what to do with them. */
  damagedPending: boolean;
  items: CustomerReturnItem[];
  events: CustomerReturnEvent[];
}

export interface CustomerReturnsResponse {
  isManagement: boolean;
  /** Sales agents answer resend / cancel on courier returns. */
  isSales: boolean;
  /** Owners and warehouse staff: log parcels, check pieces, put back, re-send. */
  isWarehouse: boolean;
  returns: CustomerReturn[];
}

/** An order's lines, for picking which pieces are in the case. */
export interface ReturnableOrderLine {
  orderItemId: string;
  productId: string | null;
  productName: string;
  orderedQty: number;
  inOpenCaseQty: number;
}

export interface NewCustomerReturn {
  orderId: string;
  source: CustomerReturnSource;
  reason: string;
  notes?: string;
  photoUrls?: string[];
  /** RTS only: the parcel is already at the warehouse. */
  parcelHere?: boolean;
  /** Which box(es) came back, for multi-box orders. */
  boxNames?: string;
  items: { orderItemId: string; qty: number }[];
}

export type CustomerReturnAction =
  | {
      action: 'decide';
      id: string;
      outcome: CustomerReturnOutcome;
      askBack: boolean;
      replacementTiming?: 'now' | 'after_arrival';
      amount?: number;
      courierClaim?: boolean;
      shippingPayer?: ShippingPayer;
      note?: string;
    }
  | { action: 'arrived'; id: string }
  | { action: 'check'; id: string; items: { id: string; goodQty: number; damagedQty: number }[]; note?: string }
  | { action: 'damaged_action'; id: string; itemId: string; damagedAction: Exclude<DamagedAction, 'never_came_back'> }
  | { action: 'outcome_done'; id: string; note?: string }
  /** Makes the ₱0 replacement order (qty per case item; 0 = leave out). */
  | { action: 'replacement_order'; id: string; items: { id: string; qty: number }[]; note?: string }
  /** Owners: refund paid; logged as an expense. */
  | { action: 'refund_sent'; id: string; amount: number; method: string; reference?: string; note?: string }
  /** Owners: amount added to the customer's store credit. */
  | { action: 'credit_given'; id: string; amount: number; note?: string }
  | { action: 'add_photos'; id: string; photoUrls: string[] }
  | { action: 'cancel_case'; id: string; note?: string }
  /** Courier return: sales (or owners) choose resend or cancel. */
  | { action: 'rts_decide'; id: string; choice: 'resend' | 'cancel'; note?: string; shippingPayer?: ShippingPayer }
  /** One box came back and is re-sent: make its own order (money moves with it). */
  | { action: 'resend_box'; id: string }
  /** Courier return: sales asked the customer; ask again in 4 hours. */
  | { action: 'waiting_customer'; id: string; note?: string }
  /** Staff put the OK pieces back on the shelf (stock goes up now). */
  | { action: 'shelved'; id: string };

/** An order found when logging a returned parcel. */
export interface ParcelOrderMatch {
  orderId: string;
  shortId: string;
  customerName: string;
  status: string;
  orderDate: string;
  trackingNumber: string | null;
  items: string;
  openCaseNo: number | null;
  /** Boxes when the order shipped as more than one parcel (else empty). */
  boxes: ParcelBox[];
}

export interface ParcelBox {
  id: string;
  name: string;
  items: string;
}

/** A courier return waiting on this person's resend / cancel answer (the pop-up). */
export interface RtsDecisionPrompt {
  id: string;
  caseNo: number;
  orderId: string;
  customerName: string;
  salesPersonName: string | null;
  items: string;
  loggedAt: string;
  waitingCustomerAt: string | null;
  escalated: boolean;
  /** Only some boxes came back: resend needs a shipping-fee choice. */
  partial: boolean;
  boxNames: string | null;
}
