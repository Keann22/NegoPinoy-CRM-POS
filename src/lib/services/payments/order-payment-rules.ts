/**
 * What a payment does to an order. Used by Log Payment for one order and by the
 * GCash-for-several-orders save, so both behave the same.
 */

export interface PayableOrder {
  amount_paid: number | string | null;
  total_amount: number | string | null;
  status: string;
  payment_method?: string | null;
}

export interface PaymentEffect {
  newAmountPaid: number;
  newBalanceDue: number;
  /** Money above the order total that this payment added (earlier overpayment not counted again). */
  overpayment: number;
  newStatus: string;
}

export function paymentEffect(order: PayableOrder, amount: number, paymentMethod: string): PaymentEffect {
  const oldPaid = Number(order.amount_paid || 0);
  const total = Number(order.total_amount || 0);
  const newAmountPaid = oldPaid + amount;
  const newBalanceDue = Math.max(0, total - newAmountPaid);
  const overpayment = Math.max(0, Math.max(0, newAmountPaid - total) - Math.max(0, oldPaid - total));

  // Fully paid only closes the order once it is already with the courier. A paid
  // lay-away that hasn't been packed must stay open, or it drops off the
  // picker, packer and Priority List and nobody ships it.
  const isCOD = order.payment_method === 'COD' || paymentMethod === 'COD Payed';
  let newStatus = order.status;
  if (newBalanceDue <= 0 && ['Shipped', 'For Pick-up'].includes(order.status)) {
    newStatus = isCOD ? 'Payment Received (COD)' : 'Completed';
  }
  return { newAmountPaid, newBalanceDue, overpayment, newStatus };
}

export interface ShareableOrder {
  balance_due: number | string | null;
  payment_method?: string | null;
  installment_months?: number | null;
  monthly_payment?: number | string | null;
}

/** Lay-away = paid little by little: "Installment" (fixed months) or "Lay-away" (no schedule). */
export const isLayawayOrder = (o: ShareableOrder) =>
  o.payment_method === 'Lay-away' || o.payment_method === 'Installment' || (o.installment_months || 0) > 0;

/**
 * What one GCash transfer should put on an order by default (owner, 2026-11-04):
 * a lay-away's usual installment (never more than its balance), else the balance.
 * "Installment" orders store a monthly amount; "Lay-away" orders don't, but customers
 * pay the same amount each time, so their last payment is the best guess.
 */
export function suggestedShare(order: ShareableOrder, lastPayment?: number | null): number {
  const balance = Math.max(0, Number(order.balance_due || 0));
  if (isLayawayOrder(order)) {
    const usual = Number(order.monthly_payment || 0) || Number(lastPayment || 0);
    if (usual > 0) return round2(Math.min(usual, balance));
  }
  return round2(balance);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
