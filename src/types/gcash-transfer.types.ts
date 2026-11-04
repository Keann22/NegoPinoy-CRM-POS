/** An order that one GCash transfer can pay (same customer, still owes money). */
export interface TransferOrder {
  id: string;
  shortId: string;
  status: string;
  orderDate: string | null;
  totalAmount: number;
  balanceDue: number;
  isLayaway: boolean;
  /** Installment orders: the stored monthly amount. */
  monthlyPayment: number | null;
  /** Lay-away orders: what the customer paid last time on this order. */
  lastPayment: number | null;
  /** What the app pre-fills: a lay-away's usual installment, else the balance. */
  suggestedShare: number;
}

export interface TransferShare {
  orderId: string;
  amount: number;
}

export interface SaveTransferInput {
  /** The order the agent opened Log Payment from; any extra money lands here. */
  mainOrderId: string;
  /** The whole amount on the GCash screenshot. */
  transferAmount: number;
  shares: TransferShare[];
  paymentDate: string;
  paymentMethod: string;
  notes?: string;
  proofUrl: string;
  /** Extra money is a tip instead of store credit. */
  isTip?: boolean;
}

export interface SaveTransferResult {
  transferId: string;
  /** The payment on the main order; OCR runs on it and copies to the rest. */
  mainPaymentId: string;
  /** Orders this transfer finished paying (for the "fully paid" alert). */
  fullyPaidOrderIds: string[];
  storeCredit: number;
  tip: number;
}
