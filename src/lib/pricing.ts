/**
 * pricing.ts
 * Single source of truth for sale resolution.
 *
 * A product is "on sale" when its `is_on_sale` flag is true. Being on sale
 * always shows the SALE badge; it does NOT require a lower price. This covers
 * two cases:
 *   1. Same-price sale — flag on, no (or an equal/higher) `sale_price`. The
 *      badge shows for selling psychology (e.g. Facebook Live) but the price is
 *      unchanged. This replaces the make-a-separate-SKU habit.
 *   2. Real discount — flag on AND `sale_price` is a positive number strictly
 *      below `selling_price`. The sale price is charged and the regular price is
 *      shown struck-through.
 *
 * Discounts apply to the CASH price only — the installment (first-timer) price
 * is never affected here. Clearing the flag (false) ends the sale.
 *
 * Use these helpers everywhere a price is charged or displayed so the rule
 * stays consistent across the product editor, the products list, and the POS.
 */

/** Whether the product is flagged on sale (shows the SALE badge). */
export function isOnSale(saleActive?: boolean | null): boolean {
  return !!saleActive;
}

/**
 * Whether there is an actual price reduction: a positive `sale_price` strictly
 * below the regular `selling_price`. Independent of the flag so callers can
 * decide whether to render a struck-through regular price.
 */
export function hasSaleDiscount(
  sellingPrice?: number | null,
  salePrice?: number | null
): boolean {
  const regular = Number(sellingPrice) || 0;
  const sale = Number(salePrice);
  return Number.isFinite(sale) && sale > 0 && sale < regular;
}

/**
 * The price to actually charge/show: the sale price only when the product is
 * flagged on sale AND that sale price is a real discount; otherwise the regular
 * selling price. A same-price sale (flag on, no lower price) charges regular.
 */
export function getEffectivePrice(
  sellingPrice?: number | null,
  salePrice?: number | null,
  saleActive?: boolean | null
): number {
  return isOnSale(saleActive) && hasSaleDiscount(sellingPrice, salePrice)
    ? Number(salePrice)
    : Number(sellingPrice) || 0;
}
