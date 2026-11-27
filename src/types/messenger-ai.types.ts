/**
 * messenger-ai.types.ts
 * Centralized types for the Messenger AI Sales Copilot (native Next.js + Supabase + Gemini).
 */

export type MessengerAiActionType =
  | 'order_edit_items'
  | 'order_hold_or_reschedule'
  | 'order_cancel'
  | 'payment_proof'
  | 'payment_promise'
  | 'bus_shipping_request'
  | 'damage_or_complaint'
  | 'waiting_prompt_reply'
  | 'delivery_or_order_note';

export type MessengerAiExecutionMode = 'stage_confirm' | 'auto_apply';

export type MessengerAiActionStatus =
  | 'pending_confirm'
  | 'auto_applied_pending_check'
  | 'confirmed'
  | 'edited_and_applied'
  | 'rejected'
  | 'undone'
  | 'auto_superseded';

export type MessengerAiVerdict = 'correct' | 'edited' | 'rejected';

export type MessengerAiErrorCategory =
  | 'inquiry_only'
  | 'wrong_variant'
  | 'wrong_order'
  | 'wrong_amount'
  | 'already_done'
  | 'other';

export interface CopilotOpenOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface CopilotOpenOrderOption {
  id: string;
  shortId: string;
  status: string;
  orderDate: string;
  paymentMethod: string;
  totalAmount: number;
  balanceDue: number;
  isPrinted: boolean;
  itemsSummary: string;
  items: CopilotOpenOrderItem[];
}

export interface OrderEditItemChange {
  op: 'add' | 'remove' | 'set_qty' | 'swap';
  productId?: string | null;
  productName: string;
  replaceProductId?: string | null;
  replaceProductName?: string | null;
  quantity: number;
  unitPrice?: number;
  phraseUsed?: string | null;
}

export interface OrderEditItemsPayload {
  kind: 'order_edit_items';
  orderId: string | null;
  createNewOrder: boolean;
  newOrderPaymentType?: 'COD' | 'Lay-away' | 'Full Payment';
  items: OrderEditItemChange[];
  note?: string | null;
}

export interface ShipHoldPayload {
  kind: 'order_hold_or_reschedule';
  orderId: string | null;
  holdKind: 'with_orders' | 'payment' | 'adding' | 'date' | 'other';
  shipVia: 'courier' | 'bus';
  checkOn: string;
  withOrderIds: string[];
  note: string;
}

export interface OrderCancelPayload {
  kind: 'order_cancel';
  orderId: string | null;
  reason: string;
}

export interface PaymentSplitShare {
  orderId: string;
  amount: number;
}

export interface PaymentProofPayload {
  kind: 'payment_proof';
  orderId: string | null;
  totalAmount: number;
  paymentMethod: 'GCash' | 'Bank Transfer' | 'Cash' | 'Other';
  referenceNumber: string | null;
  receiverVerified?: boolean | null;
  receiverNote?: string | null;
  /** Text the AI read on the screenshot (phones, ref); only set when there was a photo. Used for the GCash receiver check. */
  receiptText?: string | null;
  shares: PaymentSplitShare[];
  note?: string | null;
}

export interface PaymentPromisePayload {
  kind: 'payment_promise';
  orderId: string | null;
  promisedDate: string;
  promisedAmount?: number | null;
  note: string;
}

export interface CopilotWaitingPrompt {
  promptType: 'rts' | 'supplier_stock' | 'ship_hold';
  promptId: string;
  orderId: string;
  shortOrderId: string;
  summary: string;
  allowedChoices: string[];
}

export interface BusShippingRequestPayload {
  kind: 'bus_shipping_request';
  orderId: string | null;
  orderIds: string[];
  busCompany: string;
  destination: string;
  note?: string | null;
}

export type DamageComplaintSource = 'damage_report' | 'shipped_back';
export type DamageComplaintReason =
  | 'Damaged in transit'
  | 'Defective / not working'
  | 'Wrong item'
  | 'Missing item or part'
  | 'Other';

export interface DamageOrComplaintPayload {
  kind: 'damage_or_complaint';
  orderId: string | null;
  source: DamageComplaintSource;
  reason: DamageComplaintReason;
  items: Array<{ productName: string; quantity: number }>;
  notes: string;
  attachPhoto: boolean;
}

export interface WaitingPromptReplyPayload {
  kind: 'waiting_prompt_reply';
  orderId: string | null;
  promptType: 'rts' | 'supplier_stock' | 'ship_hold';
  promptId: string | null;
  choice: string;
  checkOn?: string | null;
  shippingPayer?: 'us' | 'customer' | null;
  note?: string | null;
}

export interface DeliveryOrOrderNotePayload {
  kind: 'delivery_or_order_note';
  orderId: string | null;
  deliveryNote: string;
  receiverName?: string | null;
  receiverPhone?: string | null;
}

export type CopilotActionPayload =
  | OrderEditItemsPayload
  | ShipHoldPayload
  | OrderCancelPayload
  | PaymentProofPayload
  | PaymentPromisePayload
  | BusShippingRequestPayload
  | DamageOrComplaintPayload
  | WaitingPromptReplyPayload
  | DeliveryOrOrderNotePayload;

export interface MessengerAiRule {
  actionType: MessengerAiActionType;
  label: string;
  phase: number;
  mode: MessengerAiExecutionMode;
  enabled: boolean;
  showSalesPopup: boolean;
  minConfidence: number;
  updatedAt: string;
  updatedByName: string | null;
}

export interface MessengerAiAction {
  id: string;
  psid: string;
  customerId: string | null;
  customerName: string | null;
  orderId: string | null;
  sourceLogIds: string[];
  chatExcerpt: string;
  attachmentUrl: string | null;
  actionType: MessengerAiActionType;
  executionMode: MessengerAiExecutionMode;
  confidence: number;
  ambiguousOrder: boolean;
  aiReasoning: string;
  summaryTaglish: string;
  draftReply: string | null;
  beforeSnapshot: Record<string, unknown>;
  proposedPayload: CopilotActionPayload;
  finalPayload: CopilotActionPayload | null;
  openOrdersSnapshot: CopilotOpenOrderOption[];
  status: MessengerAiActionStatus;
  assigneeIds: string[];
  assigneeName: string | null;
  verdict: MessengerAiVerdict | null;
  errorCategory: MessengerAiErrorCategory | null;
  diffFields: string[] | null;
  staffNote: string | null;
  appliedSummary: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface MessengerAiLesson {
  id: string;
  actionId: string | null;
  actionType: MessengerAiActionType;
  verdict: 'edited' | 'rejected';
  errorCategory: string | null;
  chatExcerpt: string;
  whatAiDid: Record<string, unknown>;
  whatWasRight: Record<string, unknown>;
  lessonText: string;
  active: boolean;
  createdByName: string | null;
  createdAt: string;
}

export interface MessengerProductAlias {
  id: string;
  phraseNormalized: string;
  productId: string;
  productName: string;
  source: 'staff_correction' | 'confirmed_ai' | 'manual';
  hitCount: number;
  updatedAt: string;
}

export interface MessengerAiAccuracyRow {
  actionType: MessengerAiActionType;
  label: string;
  totalReviewed: number;
  correctCount: number;
  editedCount: number;
  rejectedCount: number;
  accuracyRate: number;
  graduationReady: boolean;
}

export interface MessengerAiDashboardData {
  rules: MessengerAiRule[];
  accuracyByAction: MessengerAiAccuracyRow[];
  topErrorCategories: Array<{ category: string; count: number }>;
  pendingActions: MessengerAiAction[];
  recentReviewed: MessengerAiAction[];
  lessons: MessengerAiLesson[];
  aliases: MessengerProductAlias[];
}

export interface VariantSearchResult {
  id: string;
  name: string;
  sellingPrice: number;
  shelfStock: number;
}

export const ACTION_TYPE_META: Record<
  MessengerAiActionType,
  { label: string; shortLabel: string; badgeClass: string; description: string }
> = {
  order_edit_items: {
    label: 'Order Edit / New Order',
    shortLabel: 'Edit / New Order',
    badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25',
    description: 'Add, remove, swap variant, or start a new order.',
  },
  order_hold_or_reschedule: {
    label: 'Hold / Reschedule',
    shortLabel: 'Ship Hold',
    badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
    description: 'Hold shipping, wait for payday, or combine orders.',
  },
  order_cancel: {
    label: 'Cancel Order',
    shortLabel: 'Cancel',
    badgeClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25',
    description: 'Cancel an open order (triggers put-back if picked).',
  },
  payment_proof: {
    label: 'Payment Proof (GCash/Bank)',
    shortLabel: 'Payment',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
    description: 'Reads payment receipt & pre-fills single or split order shares.',
  },
  payment_promise: {
    label: 'Payment Promise',
    shortLabel: 'Promise',
    badgeClass: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/25',
    description: 'Sets follow-up reminder & due date when customer promises a date.',
  },
  bus_shipping_request: {
    label: 'Bus Shipping',
    shortLabel: 'Bus Ship',
    badgeClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25',
    description: 'Mark open orders for bus terminal delivery.',
  },
  damage_or_complaint: {
    label: 'Damage / Complaint',
    shortLabel: 'Complaint',
    badgeClass: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/25',
    description: 'Pre-fill a Customer Return / Damage case.',
  },
  waiting_prompt_reply: {
    label: 'Waiting Prompt Reply',
    shortLabel: 'Reply',
    badgeClass: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/25',
    description: 'Pre-select customer answer on RTS / Supplier / Hold.',
  },
  delivery_or_order_note: {
    label: 'Delivery / Order Note',
    shortLabel: 'Note',
    badgeClass: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/25',
    description: 'Append delivery or receiver note.',
  },
};

export const ERROR_CATEGORY_META: Record<MessengerAiErrorCategory, { label: string; hint: string }> = {
  inquiry_only: { label: 'Nagtanong lang', hint: 'Customer was only asking, not confirming an order or change.' },
  wrong_variant: { label: 'Maling item / kulay', hint: 'Wrong product or color/size variant picked.' },
  wrong_order: { label: 'Maling order', hint: 'Picked the wrong open order (or should be a new order).' },
  wrong_amount: { label: 'Maling bayad / halaga', hint: 'Amount, ref #, or order split was wrong.' },
  already_done: { label: 'Nagawa ko na', hint: 'Sales already updated this manually.' },
  other: { label: 'Iba pa', hint: 'Other mistake (explain in note).' },
};
