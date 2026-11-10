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

/** What the customer still owes on the order right now. */
export function owedNow(order: { totalAmount?: number | null; amountPaid?: number | null }): number {
  return round2(Math.max(0, Number(order.totalAmount || 0) - Number(order.amountPaid || 0)));
}

/**
 * COD for each SPX row (one per box). Uses the amount saved at Verify Shipping
 * (boxes_config cod_amount). Orders verified before 2026-11-10 have no
 * cod_amount; back then Verify Shipping saved the COD amount into balance_due,
 * so fall back to that.
 *
 * Never more than the customer still owes: a payment logged after Verify
 * Shipping (GCash, store credit) doesn't change the saved amount, so the cap
 * stops the courier from collecting money that was already paid. Boxes take
 * the cap in order.
 */
export function exportBoxCods(
  shippingType: string | null | undefined,
  boxes: ({ cod_amount?: unknown } | null | undefined)[],
  legacyBalanceDue: number,
  owed: number,
): number[] {
  const rows = boxes.length > 0 ? boxes : [null];
  if (!collectsItemCod(shippingType)) return rows.map(() => 0);
  const saved = rows.map((b) => (b && b.cod_amount !== undefined && b.cod_amount !== null ? Number(b.cod_amount) || 0 : null));
  const anySaved = saved.some((v) => v !== null);
  let left = round2(Math.max(0, owed));
  return rows.map((_, i) => {
    const want = anySaved ? Math.max(0, saved[i] ?? 0) : i === 0 ? Math.max(0, Number(legacyBalanceDue) || 0) : 0;
    const cod = round2(Math.min(want, left));
    left = round2(left - cod);
    return cod;
  });
}

const SHIPPED_STATUSES = ['Shipped', 'Completed', 'Payment Received (COD)', 'For Pick-up', 'Returned', 'Cancelled'];

/**
 * "Add SPX SF" (shipping fee paid from store credit) only once, and only before
 * the order ships: after that the waybill is done and a second SF would charge
 * the customer twice. Used by the server and the Order Detail button.
 */
export function canAddSpxSf(order: { status?: string | null; shipping_fee?: number | string | null }): boolean {
  return !SHIPPED_STATUSES.includes(order.status || '') && Number(order.shipping_fee || 0) <= 0.009;
}

/** Free shipping = the receiver pays no shipping fee (we or the sender already did). */
export const isFreeShipping = (shippingType: string | null | undefined) =>
  (shippingType || '').trim().toLowerCase() === 'free shipping';

/**
 * Line for the SPX delivery instruction. SPX bookings add the shipping fee to
 * the COD after our file is uploaded (2026-11-10: a paid lay-away sent with
 * ₱0 COD was collected ₱410), so free-shipping parcels say so in the file.
 */
export function freeShippingNote(shippingType: string | null | undefined, cod: number): string {
  if (!isFreeShipping(shippingType)) return '';
  return cod > 0
    ? `FREE SHIPPING: SF already paid. Collect only ₱${cod.toFixed(2)}, do not add SF.`
    : 'FREE SHIPPING: SF already paid. Receiver pays ₱0, do not add SF.';
}
