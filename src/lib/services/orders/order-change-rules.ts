import type { OrderItemChange } from '@/types/order-changes';

type Line = { productId: string; productName?: string; quantity: number | string };

/** Statuses where the order has left the warehouse (or never will): no notice. */
export const ORDER_STATUSES_DONE = [
  'Shipped', 'Delivered', 'Completed', 'Cancelled', 'Returned', 'Payment Received (COD)',
];

/** Products whose total quantity differs between the old and new item lists. */
export function diffOrderItems(before: Line[], after: Line[]): OrderItemChange[] {
  const sum = (lines: Line[]) => {
    const m = new Map<string, { qty: number; name: string }>();
    for (const l of lines) {
      const cur = m.get(l.productId) || { qty: 0, name: l.productName || '' };
      cur.qty += Number(l.quantity) || 0;
      if (!cur.name && l.productName) cur.name = l.productName;
      m.set(l.productId, cur);
    }
    return m;
  };
  const a = sum(before);
  const b = sum(after);
  const ids = Array.from(new Set([...Array.from(a.keys()), ...Array.from(b.keys())]));
  return ids
    .map((id) => ({
      product_id: id,
      name: b.get(id)?.name || a.get(id)?.name || 'Item',
      before: a.get(id)?.qty || 0,
      after: b.get(id)?.qty || 0,
    }))
    .filter((c) => c.before !== c.after);
}

/**
 * Several edits in a row → one net change per product: the quantity before the
 * first edit and after the last. Products that ended where they started drop out.
 * `edits` must be oldest first.
 */
export function mergeOrderChanges(edits: OrderItemChange[][]): OrderItemChange[] {
  const m = new Map<string, OrderItemChange>();
  for (const edit of edits) {
    for (const c of edit) {
      const cur = m.get(c.product_id);
      if (cur) m.set(c.product_id, { ...cur, name: c.name || cur.name, after: c.after });
      else m.set(c.product_id, { ...c });
    }
  }
  return Array.from(m.values()).filter((c) => c.before !== c.after);
}

/** "+2 added", "removed", "1 → 3" — what the warehouse should do with the line. */
export function describeChange(c: OrderItemChange): { kind: 'added' | 'removed' | 'more' | 'less'; label: string } {
  if (c.before === 0) return { kind: 'added', label: `New: ${c.after} pc${c.after === 1 ? '' : 's'}` };
  if (c.after === 0) return { kind: 'removed', label: `Removed (was ${c.before})` };
  if (c.after > c.before) return { kind: 'more', label: `${c.before} → ${c.after} (+${c.after - c.before})` };
  return { kind: 'less', label: `${c.before} → ${c.after} (−${c.before - c.after})` };
}
