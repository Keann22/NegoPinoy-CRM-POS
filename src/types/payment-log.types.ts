export type PaymentStatus = 'Pending' | 'Verified' | 'Rejected';

export type PaymentBucket =
  | 'all'
  | 'flagged'
  | 'gcash_ref'
  | 'amount_mismatch'
  | 'missing_ref'
  | 'bank_other'
  | 'cash_cod'
  | 'cancelled';

export interface PaymentLogItem {
  id: string;
  order_id: string | null;
  amount: number;
  payment_date: string;
  created_at: string;
  payment_method: string;
  notes: string | null;
  reference_number: string | null;
  proof_url: string | null;
  ocr_amount: number | null;
  status: PaymentStatus;
  transfer_id: string | null;
  transfer_amount: number | null;
  order_status: string | null;
  customer_id: string | null;
  customer_name: string;
  sales_person_name: string;
}

export interface PaymentLogCounts {
  Pending: number;
  Verified: number;
  Rejected: number;
}

export interface StatementMismatchPayment {
  id: string;
  orderId: string | null;
  orderShortId: string;
  customerName: string;
  amount: number;
  status: PaymentStatus;
  proofUrl: string | null;
}

export interface StatementAmountMismatch {
  refNo: string;
  statementDate: string | null;
  statementAmount: number;
  statementDesc: string;
  recordedSum: number;
  payments: StatementMismatchPayment[];
}

export interface StatementDateAmountCandidate {
  paymentId: string;
  orderId: string | null;
  orderShortId: string;
  customerName: string;
  paymentDate: string;
  paymentMethod: string;
  amount: number;
  ocrAmount: number | null;
  proofUrl: string | null;
  notes: string | null;
  statementDate: string;
  statementRef: string | null;
  statementAmount: number;
  statementDesc: string;
  channelLabel: string | null;
  confidence: 'high' | 'medium';
  dayDiff: number;
  isAmbiguous: boolean;
}

export interface VerifyPdfResponse {
  success: boolean;
  verifiedCount: number;
  amountMismatches: StatementAmountMismatch[];
  suggestedMatches: StatementDateAmountCandidate[];
  statementRowCount: number;
  statementDateRange: { min: string | null; max: string | null };
}
