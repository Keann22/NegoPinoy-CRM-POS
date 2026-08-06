export type MissingTrackingOrder = {
  id: string;
  shortId: string;
  customerName: string;
  customerId: string | null;
  orderDate: string;
  status: string;
  paymentMethod: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
};
