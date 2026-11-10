export interface ApplyStoreCreditInput {
  orderId: string;
  amount: number;
  actorName: string;
  note?: string;
}

export interface ApplyStoreCreditResult {
  paymentId: string;
  orderId: string;
  amountApplied: number;
  newBalanceDue: number;
  creditLeft: number;
  newStatus: string;
  hasPendingSourcePayment: boolean;
}

export interface CustomerCreditInfo {
  customerId: string;
  customerName: string;
  storeCredit: number;
  balanceDue: number;
  hasPendingPayment: boolean;
}
