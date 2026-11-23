export interface ReadyToPickItem {
  productId: string;
  name: string;
  neededQty: number;
  shelfStock: number;
  shelfLocation: string | null;
}

export interface ReadyToPickOrder {
  id: string;
  orderNo: string;
  status: 'Picked (with issue)' | 'Processing';
  orderDate: string;
  customerName: string;
  paymentMethod: string;
  isPaid: boolean;
  paidPercent: number;
  salesPersonName: string | null;
  noOpenIssue: boolean;
  items: ReadyToPickItem[];
}

export interface ReadyToPickResponse {
  generatedAt: string;
  pickedWithIssue: ReadyToPickOrder[];
  processing: ReadyToPickOrder[];
  contendedCount: number;
}
