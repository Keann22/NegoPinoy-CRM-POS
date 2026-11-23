/** One product whose quantity changed when an order was edited. */
export interface OrderItemChange {
  product_id: string;
  name: string;
  before: number;
  after: number;
}

/** Open "order changed" notices for one order, merged into the net change. */
export interface OrderChangeNotice {
  orderId: string;
  orderCode: string;
  customerName: string;
  status: string;
  /** Net change since the warehouse last handled it (oldest before → latest after). */
  changes: OrderItemChange[];
  changedBy: string[];
  firstChangedAt: string;
  lastChangedAt: string;
  editCount: number;
  wasPrinted: boolean;
  /** Already picked: the added items must be picked and the removed ones put back. */
  afterPicking: boolean;
}

export type OrderChangeAction = 'reprinted' | 'seen';
