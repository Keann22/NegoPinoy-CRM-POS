/**
 * Can the shelf cover the orders that aren't picked yet? (owner, 2026-11-26)
 *
 * Found 2026-11-26: Ready to pack listed 180 orders, but 60 of the 96 not
 * picked yet were missing items on the shelf. An item only counted as missing
 * after a picker reported it OS, so nobody had checked the shelf.
 *
 * The shelf is shared out like the Ready to Pick page: paid orders first, then
 * the oldest. An order only takes pieces when the shelf covers all of it, so an
 * order that's short anyway doesn't keep the last pieces from one that can go.
 * What the shelf can't cover is then matched against purchases on the way
 * (bought, not received yet), in the same order.
 */

export interface CoverageOrder {
  id: string;
  /** Paid in full (COD doesn't count): gets the shelf first. */
  paid: boolean;
  orderDate: string;
  /** Pieces needed per product, sets already split into their parts. */
  needs: Map<string, number>;
}

export interface ShelfShortItem {
  productId: string;
  /** Pieces this order can't get from the shelf. */
  qty: number;
  /** Pieces the shelf has (taken by orders ahead of this one, or not enough). */
  onShelf: number;
  /** A purchase on the way covers the short pieces. */
  incoming: boolean;
}

export function coverageOrderCompare(a: CoverageOrder, b: CoverageOrder): number {
  if (a.paid !== b.paid) return a.paid ? -1 : 1;
  const byDate = a.orderDate.localeCompare(b.orderDate);
  return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
}

/** Short items per order; orders the shelf fully covers aren't in the map. */
export function allocateShelf(
  orders: CoverageOrder[],
  shelfOf: (productId: string) => number,
  incomingOf: (productId: string) => number
): Map<string, ShelfShortItem[]> {
  const shelfLeft = new Map<string, number>();
  const incomingLeft = new Map<string, number>();
  const left = (map: Map<string, number>, id: string, start: (id: string) => number) =>
    map.has(id) ? map.get(id)! : Math.max(0, start(id));

  const short = new Map<string, ShelfShortItem[]>();
  for (const order of [...orders].sort(coverageOrderCompare)) {
    const needs = Array.from(order.needs.entries()).filter(([, qty]) => qty > 0);
    const covered = needs.every(([id, qty]) => left(shelfLeft, id, shelfOf) >= qty);
    if (covered) {
      needs.forEach(([id, qty]) => shelfLeft.set(id, left(shelfLeft, id, shelfOf) - qty));
      continue;
    }
    const items: ShelfShortItem[] = [];
    for (const [id, qty] of needs) {
      const onShelf = left(shelfLeft, id, shelfOf);
      if (onShelf >= qty) continue;
      const missing = qty - onShelf;
      const coming = left(incomingLeft, id, incomingOf);
      const incoming = coming >= missing;
      if (incoming) incomingLeft.set(id, coming - missing);
      items.push({ productId: id, qty: missing, onShelf, incoming });
    }
    short.set(order.id, items);
  }
  return short;
}
