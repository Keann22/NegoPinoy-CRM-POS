/**
 * Bus shipping (owner, 2026-11-05). We pay the bus company at the terminal, then
 * the fee goes on the customer's orders. Bus companies charge by weight + item
 * value, one fee per trip. See docs/BUSINESS_WORKFLOW.md, "Bus shipping".
 */

/** Bus companies we know of; staff can type a new one. */
export const KNOWN_BUS_COMPANIES = [
  'Victory Liner', 'Five Star', 'Partas', 'Florida', 'Genesis', 'Solid North',
  'Dalin Liner', 'Baliwag Transit', 'Philtranco', 'Joybus',
];

/** Order statuses that can go on a bus (goods are picked, in our hands). */
export const BUS_SHIPPABLE_STATUSES = ['Picked', 'Photo', 'Packed', 'For Shipping', 'For Pick-up', 'Shipped'];

/** One of the customer's orders that can go on the trip. */
export interface BusCandidateOrder {
  id: string;
  shortId: string;
  status: string;
  orderDate: string | null;
  customerId: string | null;
  customerName: string;
  salesPersonName: string | null;
  items: string;
  /** Item value (what the customer pays for the items, after discount). */
  itemValue: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  shippingFee: number;
  /** Paid above the order total, usually SF sent in advance. */
  advance: number;
  /** Weight from the Packer, when it was scanned. */
  weightKg: number | null;
  boxCount: number | null;
  /** Already on a recorded bus trip. */
  busShipmentId: string | null;
  canShip: boolean;
  /** Why it can't go (status), when canShip is false. */
  blockedReason: string | null;
}

export interface BusFeeShare {
  orderId: string;
  amount: number;
}

export interface SaveBusShipmentInput {
  busCompany: string;
  destination: string;
  fee: number;
  weightKg: number | null;
  declaredValue: number | null;
  boxCount: number | null;
  receiptUrl: string | null;
  freeShipping: boolean;
  shares: BusFeeShare[];
}

/** What the customer still owes, or sent extra, for the SF across the trip. */
export interface BusSfResult {
  advance: number;
  /** Store credit taken back because the advance SF had become store credit. */
  creditUsed: number;
  /** Advance that had already left store credit (spent or never credited). */
  creditShort: number;
  owed: number;
  extra: number;
}

export interface SaveBusShipmentResult extends BusSfResult {
  shipmentId: string;
  trackingText: string;
}

/** One recorded trip, for Bus Rates. */
export interface BusTrip {
  id: string;
  busCompany: string;
  destination: string;
  fee: number;
  weightKg: number | null;
  declaredValue: number | null;
  boxCount: number | null;
  shippedAt: string;
  orderIds: string[];
  customerName: string | null;
  receiptUrl: string | null;
}

/** The sales agent's pop-up: collect SF, or decide what to do with extra. */
export interface BusSfPrompt {
  id: string;
  kind: 'owed' | 'extra';
  amount: number;
  customerName: string;
  orderIds: string[];
  busCompany: string;
  destination: string;
  fee: number;
  shippedAt: string;
  salesPersonName: string | null;
}

export type BusSfAnswer = 'waiting' | 'keep_credit' | 'tip' | 'refund';

export interface BusEstimate {
  busCompany: string;
  trips: number;
  /** Likely fee for the weight/value asked; null when there's nothing to go on. */
  estimate: number | null;
  /** How it was worked out, in plain words. */
  basis: string;
  lastFee: number;
  lastDate: string;
  minFee: number;
  maxFee: number;
}
