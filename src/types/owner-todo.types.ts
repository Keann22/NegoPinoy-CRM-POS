/** Owner to-do (owner, 2026-11-25): work only the owners can do, worked out from live data. */

export type OwnerTodoKey =
  | 'gcash_statement'
  | 'flagged_payments'
  | 'spx_remittance'
  | 'held_counts'
  | 'payment_fix'
  | 'returns_decide'
  | 'supplier_returns'
  | 'staff_waiting'
  | 'costs'
  | 'unpaid_other';

export type OwnerUploadKind = 'gcash_statement' | 'spx_remittance';

/** One payment flagged for the owners (GCash sent elsewhere, or a reference used twice). */
export interface FlaggedPayment {
  id: string;
  orderId: string | null;
  amount: number;
  method: string;
  createdAt: string;
  reason: string;
}

export interface OwnerTodoItem {
  key: OwnerTodoKey;
  title: string;
  /** One or two short lines under the title. */
  detail: string;
  count: number;
  amount: number | null;
  /** Red = overdue, amber = waiting, plain = nothing urgent. */
  level: 'red' | 'amber' | 'plain';
  href: string;
  actionLabel: string;
  /** Only on flagged_payments: the payments themselves. */
  flagged?: FlaggedPayment[];
}

export interface OwnerTodoResponse {
  items: OwnerTodoItem[];
  checkedAt: string;
}
