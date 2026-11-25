/**
 * Out of stock at the supplier (owner, 2026-11-20). See BUSINESS_WORKFLOW.md,
 * "Out of stock at the supplier". Staff see the status, never the supplier.
 */

export type SupplierFlagStatus = 'waiting_restock' | 'other_variant' | 'price_up' | 'stop_selling';

export type SupplierFlagClearReason = 'back_in_stock' | 'bought' | 'changed';

export type SupplierFlagAnswerKind =
  | 'asked' | 'waiting_customer' | 'wait' | 'agreed_on_order' | 'editing'
  | 'keep_credit' | 'refund' | 'credit_added' | 'handled' | 'gone';

export interface SupplierFlag {
  id: string;
  productId: string;
  productName: string;
  status: SupplierFlagStatus;
  note: string | null;
  altProductId: string | null;
  altProductName: string | null;
  altProductIds: string[];
  altProductNames: string[];
  newPrice: number | null;
  /** YYYY-MM-DD (PHT). */
  checkAgainOn: string | null;
  setByName: string | null;
  setAt: string;
  /** Pieces we can still sell (free to sell = shelf minus orders not picked yet). */
  freeToSell: number;
}

/** A flag plus how sales answered on the orders waiting for it (Wala sa Supplier page). */
export interface SupplierFlagWithOrders extends SupplierFlag {
  orders: {
    orderId: string;
    customerName: string;
    agent: string | null;
    paid: number;
    /** The shelf has pieces for this order: nothing to ask. */
    covered: boolean;
    /** Latest answer, or null when sales hasn't been asked yet. */
    answer: SupplierFlagAnswerKind | null;
    answeredBy: string | null;
    answeredAt: string | null;
  }[];
}

export interface SetSupplierFlagInput {
  productId: string;
  status: SupplierFlagStatus;
  note?: string | null;
  altProductId?: string | null;
  altProductIds?: string[] | null;
  newPrice?: number | null;
  checkAgainOn?: string | null;
  /** Old free-text report (procurement_issues) this replaces; it gets closed. */
  oldIssueId?: string | null;
}

/** What the sales pop-up asks. */
export type SupplierPromptKind =
  /** The item can't be bought: ask the customer, then answer. */
  | 'decide'
  /** "Customer will wait" was 14+ days ago: ask again. */
  | 'still_waiting'
  /** A paid line was removed: the extra money is in store credit. Keep or refund? */
  | 'money_removed'
  /** A paid order was cancelled: store credit or refund? */
  | 'money_cancelled';

export interface SupplierPrompt {
  /** flagId:orderId */
  key: string;
  kind: SupplierPromptKind;
  flagId: string;
  orderId: string;
  status: SupplierFlagStatus;
  productName: string;
  note: string | null;
  altProductName: string | null;
  altProductNames: string[];
  newPrice: number | null;
  customerName: string;
  agent: string | null;
  orderStatus: string;
  qty: number;
  paid: number;
  total: number;
  /** For money prompts: the amount to keep as credit or refund. */
  amount: number;
  flaggedAt: string;
  waitingCustomerAt: string | null;
  /** No answer for 3 days: owners see it too. */
  escalated: boolean;
}

export type SupplierPromptAnswer =
  | 'wait' | 'waiting_customer' | 'editing'
  | 'keep_credit' | 'refund' | 'credit_added' | 'handled';

export interface OldProcurementIssue {
  id: string;
  productId: string;
  productName: string;
  note: string;
  byName: string | null;
  createdAt: string;
}
