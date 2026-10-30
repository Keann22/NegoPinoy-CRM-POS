// Supplier Returns: bad items set aside and returned to suppliers for a
// replacement or refund. See architecture.md "Planned: Supplier Returns".

export type SupplierReturnStatus = 'to_return' | 'with_supplier' | 'closed';

/** How it goes back: in person on a buying trip, a Shopee in-app return, or Pinduoduo (no returns, discount only). */
export type SupplierReturnChannel = 'in_person' | 'shopee' | 'pinduoduo';

export type SupplierReturnFoundAt = 'picker' | 'shelf' | 'unpacking' | 'customer_return' | 'other';

export type SupplierReturnOutcome =
  | 'replaced'
  | 'refunded'
  | 'partial_refund_kept'
  | 'voucher'
  | 'written_off'
  | 'cancelled';

export const SUPPLIER_RETURN_REASONS = ['Damaged', 'Defective / not working', 'Missing parts', 'Wrong item', 'Other'] as const;

export const FOUND_AT_LABELS: Record<SupplierReturnFoundAt, string> = {
  picker: 'While picking',
  shelf: 'On the shelf',
  unpacking: 'While unpacking',
  customer_return: 'Customer return',
  other: 'Other',
};

export const OUTCOME_LABELS: Record<SupplierReturnOutcome, string> = {
  replaced: 'Replaced',
  refunded: 'Refunded',
  partial_refund_kept: 'Partial refund, we kept the item',
  voucher: 'Voucher / credit',
  written_off: 'Supplier refused, written off',
  cancelled: 'Not returned, back on the shelf',
};

export interface SupplierReturnEvent {
  id: string;
  event: string;
  qty: number | null;
  amount: number | null; // owners only; 0 for staff
  note: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface SupplierReturn {
  id: string;
  returnNo: number;
  productId: string;
  productName: string;
  sku: string | null;
  qty: number;
  replacedQty: number;
  openQty: number; // still owed by the supplier
  reason: string;
  foundAt: SupplierReturnFoundAt;
  notes: string | null;
  status: SupplierReturnStatus;
  outcome: SupplierReturnOutcome | null;
  reportedByName: string | null;
  createdAt: string;
  handedBackAt: string | null;
  handedBackByName: string | null;
  closedAt: string | null;
  closedByName: string | null;
  daysWaiting: number; // since handed back, or since reported while still here
  limitDays: number; // supplier's replacement days (default 7)
  isOverdue: boolean;
  customerWaiting: boolean; // an open order still needs this product
  channel: SupplierReturnChannel; // from the set or suggested supplier; safe for staff
  // Owners only (null for staff):
  supplierId: string | null;
  supplierName: string | null;
  suggestedSupplierId: string | null;
  unitCost: number | null;
  owedAmount: number | null;
  refundAmount: number | null;
  events: SupplierReturnEvent[];
}

export interface SupplierReturnSupplier {
  id: string;
  name: string;
  replacementDays: number;
}

export interface SupplierReturnsResponse {
  isManagement: boolean;
  returns: SupplierReturn[];
  suppliers: SupplierReturnSupplier[]; // owners only; empty for staff
}

export type SupplierReturnAction =
  | { action: 'hand_back'; id: string; supplierId?: string | null; unitCost?: number | null }
  | { action: 'replacement'; id: string; qty: number }
  | { action: 'close'; id: string; outcome: Exclude<SupplierReturnOutcome, 'replaced' | 'cancelled'>; amount?: number; note?: string; supplierId?: string | null }
  | { action: 'cancel'; id: string; note?: string }
  | { action: 'set_supplier'; id: string; supplierId: string | null; unitCost?: number | null };

export interface NewSupplierReturn {
  productId: string;
  qty: number;
  reason: string;
  foundAt: SupplierReturnFoundAt;
  notes?: string;
}
