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

/**
 * Price list — one SKU, several prices.
 *
 * Staff never type a price on an order; they pick a price TYPE per line and the
 * amount comes from the product's price list. The type is saved on the order
 * line (`order_items.price_type`) so sales can be reported by channel.
 *
 *   regular     — `selling_price`
 *   sale        — `sale_price`, only while the product is on sale with a real discount
 *   ads         — `ads_price`; blank falls back to the sale price, then regular
 *   live        — `live_price`; blank falls back to the sale price, then regular
 *                 (Live is usually the sale price, and often just the regular price)
 *   installment — `installment_price`, applied automatically for first-timer installment orders
 *   custom      — a hand-typed price; price managers only, and a reason is required
 */
export type PriceType = 'regular' | 'sale' | 'ads' | 'live' | 'installment' | 'custom';

export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  regular: 'Regular',
  sale: 'Sale',
  ads: 'Ads',
  live: 'Live',
  installment: 'Installment',
  custom: 'Custom',
};

export interface PriceList {
  regular: number;
  /** Null unless the product is on sale with a real discount. */
  sale: number | null;
  ads: number | null;
  live: number | null;
  installment: number | null;
}

const PRICE_LIST_COLUMNS = 'selling_price, sale_price, is_on_sale, ads_price, live_price, installment_price';
const PRICE_LIST_COLUMNS_LEGACY = 'selling_price, sale_price, is_on_sale, installment_price';

/**
 * Runs a `products` select that needs the price-list columns. If the database
 * does not have `ads_price` / `live_price` yet (migration add_price_list.sql not
 * run), it retries without them so ordering keeps working at regular/sale prices.
 */
export async function selectWithPriceColumns(
  run: (priceColumns: string) => PromiseLike<{ data: any; error: any }>
): Promise<{ data: any; error: any }> {
  const result = await run(PRICE_LIST_COLUMNS);
  // 42703 = Postgres "undefined column"
  return result.error?.code === '42703' ? run(PRICE_LIST_COLUMNS_LEGACY) : result;
}

function positiveOrNull(value?: number | null): number | null {
  const n = Number(value);
  return value != null && Number.isFinite(n) && n > 0 ? n : null;
}

/** Builds a product's price list from its raw `products` row. */
export function buildPriceList(row: {
  selling_price?: number | null;
  sale_price?: number | null;
  is_on_sale?: boolean | null;
  ads_price?: number | null;
  live_price?: number | null;
  installment_price?: number | null;
}): PriceList {
  const regular = Number(row.selling_price) || 0;
  return {
    regular,
    sale: isOnSale(row.is_on_sale) && hasSaleDiscount(regular, row.sale_price) ? Number(row.sale_price) : null,
    ads: positiveOrNull(row.ads_price),
    live: positiveOrNull(row.live_price),
    installment: positiveOrNull(row.installment_price),
  };
}

/** The amount charged for a price type. `custom` has no list amount, so it resolves to regular. */
export function resolvePrice(list: PriceList, type: PriceType): number {
  const cash = list.sale ?? list.regular;
  switch (type) {
    case 'sale': return cash;
    case 'ads': return list.ads ?? cash;
    case 'live': return list.live ?? cash;
    case 'installment': return list.installment ?? list.regular;
    default: return list.regular;
  }
}

/** The type a newly added line starts on: the sale price while there is one, otherwise regular. */
export function defaultPriceType(list: PriceList): PriceType {
  return list.sale != null ? 'sale' : 'regular';
}

/** The types staff can pick for a line. Installment and custom are never picked directly. */
export function selectablePriceTypes(list: PriceList): PriceType[] {
  return list.sale != null ? ['regular', 'sale', 'live', 'ads'] : ['regular', 'live', 'ads'];
}
