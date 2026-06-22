/**
 * order.types.ts
 * Centralized order-related type definitions.
 * All components and hooks must import order types from here.
 *
 * These are the runtime/display types (from Supabase).
 * For form validation schemas, see /src/lib/schemas/order.ts
 */

export type OrderStatus =
  | 'Pending Payment'
  | 'Processing'
  | 'Picked'
  | 'Picked (with issue)'
  | 'Photo'
  | 'Packed'
  | 'For Shipping'
  | 'For Pick-up'
  | 'Shipped'
  | 'Completed'
  | 'Cancelled'
  | 'Returned'
  | 'Payment Received (COD)'
  | 'On-Hold'
  | 'Waiting for Stock';

export type PaymentType =
  | 'Full Payment'
  | 'Lay-away'
  | 'Installment'
  | 'COD'
  | 'Pending';

export type PaymentMethod =
  | 'GCash'
  | 'Bank Transfer'
  | 'Cash'
  | 'COD'
  | 'Full Payment'
  | 'Downpayment'
  | 'Other';

export type Order = {
  id: string;
  customerId: string;
  customerName?: string;
  orderDate: string;
  orderStatus: OrderStatus;
  paymentType: PaymentType;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  subtotal?: number;
  totalDiscount?: number;
  insurance_fee?: number;
  trackingNumber?: string;
  tracking_number?: string;
  shippingDetails?: string;
  includeInsurance?: boolean;
  platformFees?: number;
  installmentMonths?: number;
  monthlyPayment?: number;
  salesPersonId?: string;
  salesPersonName?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  spx_sync_data?: any;
  boxes_config?: any;
};

/** Order with resolved customer name and formatted display fields — used by the orders list. */
export type FormattedOrder = Order & {
  customerName: string;
  formattedDate: string;
  formattedTotal: string;
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  sellingPriceAtSale: number;
  costPriceAtSale: number;
  discount?: number;
};

export type PaymentRecord = {
  id: string;
  orderId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  referenceNumber?: string;
  proofOfPaymentUrl?: string;
  notes?: string;
  recordedBy?: string;
};

export type OrderWithItems = Order & {
  items: OrderItem[];
  payments: PaymentRecord[];
};

/** All valid order statuses as a runtime array — use for filter dropdowns. */
export const ORDER_STATUSES: OrderStatus[] = [
  'Pending Payment', 'Processing', 'Picked', 'Picked (with issue)', 'Photo', 'Packed', 'For Shipping',
  'For Pick-up', 'Shipped', 'Completed', 'Payment Received (COD)',
  'Returned', 'Cancelled', 'On-Hold', 'Waiting for Stock'
];
