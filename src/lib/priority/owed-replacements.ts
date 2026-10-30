import type { MissingItem } from './priority-rules';
import type { OwedReplacement } from '@/lib/services/supplier-return-service';

/**
 * An OS item that would be "to buy" but a supplier still owes it as a
 * replacement (Supplier Returns): the next step is chasing the supplier, due
 * when that supplier's waiting limit runs out.
 */
export function applyOwedReplacements(missing: MissingItem[], owed: Map<string, OwedReplacement>): MissingItem[] {
  return missing.map((m) => {
    const o = owed.get(m.productId);
    if (m.state !== 'buy' || !o || o.qty <= 0) return m;
    return {
      ...m,
      state: 'supplier_return',
      eta: o.dueAt,
      stageLabel: `return ${o.returnNos.map((n) => `#${n}`).join(', ')}, ${o.qty} owed`,
    };
  });
}
