import { isCheckDue } from './supplier-flag-rules';
import type { SupplierFlag } from '@/types/supplier-stock.types';

interface ItemLike { productId: string }
interface GroupLike { items: ItemLike[] }
type ItemOf<G extends GroupLike> = G['items'][number];

/**
 * Procurement Sheet: items out at the supplier leave Need to Buy so they don't
 * nag on every trip. On the check-again date they come back to their supplier
 * group (with a badge) so the owner asks again.
 */
export function splitFlaggedItems<G extends GroupLike>(
  groups: G[],
  flags: Record<string, SupplierFlag>,
  now: Date = new Date(),
): { groups: G[]; flagged: { item: ItemOf<G>; flag: SupplierFlag }[] } {
  const flagged: { item: ItemOf<G>; flag: SupplierFlag }[] = [];
  const kept = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        const flag = flags[item.productId];
        if (!flag || isCheckDue(flag.checkAgainOn, now)) return true;
        flagged.push({ item, flag });
        return false;
      }),
    }))
    .filter((g) => g.items.length > 0);
  return { groups: kept, flagged };
}
