'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomerReturns } from '@/hooks/useCustomerReturns';
import { CR_OUTCOME_TODO, CR_STAGE_LABELS, type CustomerReturn } from '@/types/customer-returns.types';

/** Who has to move next on a case, and what they do. Null = nothing to act on yet. */
function nextStep(r: CustomerReturn): { who: string; what: string } | null {
  switch (r.stage) {
    case 'needs_owner':
      return r.damagedPending
        ? { who: 'Owners', what: 'Damaged pieces: throw away or sell 2nd-hand' }
        : { who: 'Owners', what: 'Decide what the customer gets' };
    case 'to_check':
      return { who: 'Warehouse', what: 'Open the parcel and check every piece' };
    case 'to_do': {
      const todo = r.outcome ? CR_OUTCOME_TODO[r.outcome] : null;
      return todo ? { who: todo.ownerOnly ? 'Owners' : 'Warehouse / agent', what: todo.label } : null;
    }
    case 'waiting_parcel':
      return r.isOverdue ? { who: 'Agent', what: `Parcel still not back after ${r.daysOpen} days: follow up` } : null;
    default:
      return null;
  }
}

interface Props {
  search: string;
  onCount: (total: number, late: number) => void;
}

/** Priority List tab: customer return cases waiting on someone. Work happens on the Returns page. */
export function ReturnsToActList({ search, onCount }: Props) {
  const { data, isLoading, error } = useCustomerReturns();

  const rows = useMemo(() => {
    const list = (data?.returns || [])
      .filter((r) => r.status === 'open')
      .map((r) => ({ r, step: nextStep(r) }))
      .filter((x): x is { r: CustomerReturn; step: { who: string; what: string } } => !!x.step);
    return list.sort((a, b) => Number(b.r.isOverdue) - Number(a.r.isOverdue) || b.r.daysOpen - a.r.daysOpen);
  }, [data]);

  useEffect(() => {
    if (data) onCount(rows.length, rows.filter((x) => x.r.isOverdue).length);
  }, [data, rows, onCount]);

  const q = search.trim().toLowerCase();
  const visible = q
    ? rows.filter(({ r }) => [r.customerName, r.orderId.slice(0, 7), String(r.caseNo), ...r.items.map((i) => i.productName)]
        .some((t) => t.toLowerCase().includes(q)))
    : rows;

  if (isLoading) return <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (visible.length === 0) {
    return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No customer returns waiting on anyone.</div>;
  }

  return (
    <div className="space-y-2">
      {visible.map(({ r, step }) => (
        <Link key={r.id} href="/dashboard/inventory/returns"
          className={`block rounded-lg border p-3 hover:bg-muted/50 ${r.isOverdue ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20' : 'bg-card'}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium leading-tight break-words">
                Return #{r.caseNo} · {r.customerName}{' '}
                <span className="font-mono text-xs text-muted-foreground">order #{r.orderId.slice(0, 7).toUpperCase()}</span>
              </p>
              <p className="text-xs text-muted-foreground break-words">
                {r.items.map((i) => `${i.qty}× ${i.productName}`).join(', ')} · {r.reason}
              </p>
            </div>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${r.isOverdue ? 'bg-red-600 text-white' : 'bg-muted'}`}>
              {CR_STAGE_LABELS[r.stage]} · {r.daysOpen}d{r.isOverdue ? ' · late' : ''}
            </span>
          </div>
          <p className="mt-1 text-sm"><span className="font-semibold">{step.who}:</span> {step.what}</p>
        </Link>
      ))}
    </div>
  );
}
