/**
 * What the courier collects for the items on delivery (COD), kept apart from
 * what the customer owes us (orders.balance_due). Used by Verify Shipping and
 * the SPX export so both follow the same rule.
 *
 * The Shipping Type says who pays the shipping fee, not whether items are COD:
 * the team verifies normal COD orders as "SF Only" (2,569 of them by
 * 2026-11-10). Only "Paid items, SF only" means nothing is collected for items.
 */

export const NO_ITEM_COD_TYPES = ['paid items, sf only'];

export function collectsItemCod(shippingType: string | null | undefined): boolean {
  return !NO_ITEM_COD_TYPES.includes((shippingType || '').trim().toLowerCase());
}

const round2 = (n: number) => Math.round(n * 100) / 100;

interface CodOrder {
  paymentType?: string | null;
  totalAmount?: number | null;
  amountPaid?: number | null;
  monthlyPayment?: number | null;
  installmentMonths?: number | null;
}

/**
 * Item COD to suggest when verifying: what's left of the order for COD and
 * full payment, and only what's left of the downpayment for a lay-away or
 * installment (the monthly payments are paid to us, not to the courier).
 */
export function suggestedItemCod(order: CodOrder): number {
  const total = Number(order.totalAmount || 0);
  const paid = Number(order.amountPaid || 0);
  if (order.paymentType === 'Installment' || order.paymentType === 'Lay-away') {
    const downpayment = total - Number(order.monthlyPayment || 0) * Number(order.installmentMonths || 0);
    return round2(Math.max(0, downpayment - paid));
  }
  return round2(Math.max(0, total - paid));
}

/**
 * COD for the SPX file. Uses the amount saved at Verify Shipping (boxes_config
 * cod_amount). Orders verified before 2026-11-10 have no cod_amount; back then
 * Verify Shipping saved the COD amount into balance_due, so fall back to that.
 */
export function exportItemCod(
  shippingType: string | null | undefined,
  box: { cod_amount?: unknown } | null | undefined,
  legacyBalanceDue: number,
): number {
  if (!collectsItemCod(shippingType)) return 0;
  if (box && box.cod_amount !== undefined && box.cod_amount !== null) return round2(Number(box.cod_amount) || 0);
  return round2(Math.max(0, Number(legacyBalanceDue) || 0));
}
