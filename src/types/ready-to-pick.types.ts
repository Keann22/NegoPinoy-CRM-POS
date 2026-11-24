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
  notes: string | null;
  noOpenIssue: boolean;
  items: ReadyToPickItem[];
}

export interface ReadyToPickResponse {
  generatedAt: string;
  pickedWithIssue: ReadyToPickOrder[];
  processing: ReadyToPickOrder[];
  contendedCount: number;
  /** "Ship on a date" holds, too early to pick (picking starts 3 days before). */
  shipLater: ReadyToPickParked[];
  /** Skipped with "Hindi pa ipi-pick": waiting for sales to set a date or say pick it. */
  askedSales: ReadyToPickParked[];
}

/** An order left off the list for now: ships later, or the warehouse asked sales. */
export interface ReadyToPickParked {
  id: string;
  orderNo: string;
  status: string;
  customerName: string;
  salesPersonName: string | null;
  /** Ships later: the ship date and the day picking starts (YYYY-MM-DD, PHT). */
  shipOn?: string;
  pickFrom?: string;
  /** Warehouse asked sales ("Hindi pa ipi-pick"). */
  reasonLabel?: string;
  note: string | null;
  byName?: string | null;
  at?: string;
}
