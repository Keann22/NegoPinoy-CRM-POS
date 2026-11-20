import { SUPPLIER_FLAG_LABELS, needsAgreement } from './supplier-flag-rules';
import type { SupplierFlag } from '@/types/supplier-stock.types';

interface LineLike { productId: string; productName: string; quantity: number | string; supplierFlagAck?: boolean }
interface OriginalLike { productId: string; quantity: number | string }

/** Pieces of each product the order adds compared with how it was saved (all of it for a new order). */
export function addedQtyByProduct(items: LineLike[], originals: OriginalLike[]): Map<string, number> {
  const out = new Map<string, number>();
  items.forEach((i) => out.set(i.productId, (out.get(i.productId) || 0) + (Number(i.quantity) || 0)));
  originals.forEach((o) => out.set(o.productId, (out.get(o.productId) || 0) - (Number(o.quantity) || 0)));
  return out;
}

/**
 * New Order / Edit Order (owner, 2026-11-20): items out at the supplier need the
 * agent's tick ("customer knows and agrees"); a stopped item can only be sold
 * up to what is still free on the shelf. Lines already on the order are left
 * to the sales pop-up.
 */
export function checkOrderAgainstFlags(
  items: LineLike[], originals: OriginalLike[], flags: Record<string, SupplierFlag>,
): { error: string | null; agreedProductIds: string[] } {
  const added = addedQtyByProduct(items, originals);
  const problems: string[] = [];
  const agreed: string[] = [];
  for (const [productId, qty] of added) {
    const flag = flags[productId];
    if (!flag || qty <= 0) continue;
    const name = items.find((i) => i.productId === productId)?.productName || flag.productName;
    if (flag.status === 'stop_selling') {
      if (qty > flag.freeToSell) {
        problems.push(flag.freeToSell > 0
          ? `${name}: we stopped selling it. Only ${flag.freeToSell} left.`
          : `${name}: we stopped selling it and none are left.`);
      }
      continue;
    }
    if (needsAgreement(flag.status)) {
      if (items.some((i) => i.productId === productId && i.supplierFlagAck)) agreed.push(productId);
      else problems.push(`${name} (${SUPPLIER_FLAG_LABELS[flag.status]}): tick "customer knows and agrees" first.`);
    }
  }
  return { error: problems.length ? problems.join(' ') : null, agreedProductIds: agreed };
}
