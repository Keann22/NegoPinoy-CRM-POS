export type ReconcileAction = 'overpayment_credit' | 'tip' | 'split_payment' | 'typo_correction';

/** Another payment logged with the same GCash reference (one transfer paid several orders). */
export interface SharedTransferPayment {
  paymentId: string;
  orderShortId: string;
  amount: number;
  isReconciled: boolean;
}

/** One row of the frozen GCash mismatch list (database table payment_discrepancies). */
export interface DiscrepancySource {
  paymentId: string;
  orderId: string;
  orderShortId: string;
  salesPerson: string;
  salesPersonId?: string;
  customerName: string;
  recordedRef: string;
  actualRef: string;
  recordedAmount: number;
  gcashAmount: number;
  difference: number;
  paymentDate: string;
  matchType?: string;
  proofUrl?: string;
  notes?: string;
  paymentMethod?: string;
}

/** A row as the page shows it: the frozen list plus what the database says now. */
export interface DiscrepancyItem extends DiscrepancySource {
  isResolved: boolean;
  /** Other payments using the same GCash reference. */
  others: SharedTransferPayment[];
  othersTotal: number;
  /** Buttons that are safe for this row right now. */
  allowedActions: ReconcileAction[];
  /** Why no button is offered, when allowedActions is empty. */
  blockedReason?: string;
}

export interface DiscrepancyKpiData {
  total: number;
  resolved: number;
  remaining: number;
  gcashSum: number;
  recordedSum: number;
  varSum: number;
}

export interface DiscrepancyListResponse {
  items: DiscrepancyItem[];
  currentUser: { id: string; name: string; isManagement: boolean };
}

export interface ReconcileResponse {
  success: true;
  message: string;
}
