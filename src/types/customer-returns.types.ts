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
export type CustomerReturnStage = 'needs_owner' | 'to_check' | 'to_do' | 'waiting_parcel' | 'done';

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
  replacement: { label: 'Replacement sent', ownerOnly: false },
  full_refund: { label: 'Refund sent', ownerOnly: true },
  partial_refund: { label: 'Refund / discount sent', ownerOnly: true },
  store_credit: { label: 'Credit given', ownerOnly: true },
  cancel_order: null,
  no_action: null,
};

export const CR_DAMAGED_ACTION_LABELS: Record<DamagedAction, string> = {
  throw_away: 'Thrown away',
  second_hand: 'Keep to sell as 2nd-hand',
  never_came_back: 'Never came back',
};

export const CR_STAGE_LABELS: Record<CustomerReturnStage, string> = {
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
  daysOpen: number;
  isOverdue: boolean;
  /** Checked, has damaged pieces, and the owners haven't said what to do with them. */
  damagedPending: boolean;
  items: CustomerReturnItem[];
  events: CustomerReturnEvent[];
}

export interface CustomerReturnsResponse {
  isManagement: boolean;
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
      note?: string;
    }
  | { action: 'arrived'; id: string }
  | { action: 'check'; id: string; items: { id: string; goodQty: number; damagedQty: number }[]; note?: string }
  | { action: 'damaged_action'; id: string; itemId: string; damagedAction: Exclude<DamagedAction, 'never_came_back'> }
  | { action: 'outcome_done'; id: string; note?: string }
  | { action: 'add_photos'; id: string; photoUrls: string[] }
  | { action: 'cancel_case'; id: string; note?: string };
