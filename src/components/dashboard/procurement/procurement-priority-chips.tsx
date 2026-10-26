'use client';

import Link from 'next/link';
import type { ItemPriority, PriorityOrderRef } from '@/lib/services/procurement-priority-service';

const orderLinks = (refs: PriorityOrderRef[]) =>
  refs.map((r, i) => (
    <span key={r.orderId}>
      {i > 0 && ', '}
      <Link href={`/dashboard/orders/${r.orderId}`} target="_blank" className="underline" title={r.note ? `“${r.note}”` : r.customerName}>
        #{r.shortOrderId}
      </Link>
    </span>
  ));

/** Under an item on the Procurement Sheet: who is waiting on it and why it should be bought first. */
export function ProcurementPriorityChips({ priority }: { priority?: ItemPriority | null }) {
  if (!priority) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold">
      {priority.urgent.length > 0 && (
        <span className="rounded bg-red-600 px-1.5 py-0.5 text-white">
          🔥 Nagmamadali: {orderLinks(priority.urgent)}
        </span>
      )}
      {priority.paid.length > 0 && (
        <span className="rounded bg-green-600 px-1.5 py-0.5 text-white">
          ✅ Bayad na: {orderLinks(priority.paid)}
        </span>
      )}
    </div>
  );
}

/** Supplier header summary: how many items in this group are holding up urgent / paid customers. */
export function ProcurementPriorityCounts({ items }: { items: any[] }) {
  const urgent = items.filter((i) => i.priority?.urgent?.length).length;
  const paid = items.filter((i) => !i.priority?.urgent?.length && i.priority?.paid?.length).length;
  if (!urgent && !paid) return null;
  return (
    <span className="flex gap-1.5 text-xs font-semibold">
      {urgent > 0 && <span className="rounded bg-red-600 px-2 py-0.5 text-white">🔥 {urgent} nagmamadali</span>}
      {paid > 0 && <span className="rounded bg-green-600 px-2 py-0.5 text-white">✅ {paid} bayad na</span>}
    </span>
  );
}
