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

export interface ApplySpxShippingFeeInput {
  orderId: string;
  shippingFee: number;
  creditToUse?: number;
  actorName: string;
  note?: string;
}

export interface ApplySpxShippingFeeResult {
  paymentId: string;
  orderId: string;
  shippingFee: number;
  creditUsed: number;
  newTotal: number;
  newBalanceDue: number;
  creditLeft: number;
  remainingFeeToPay: number;
}

