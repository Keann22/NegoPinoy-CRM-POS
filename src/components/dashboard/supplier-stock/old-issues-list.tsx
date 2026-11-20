'use client';

import { Button } from '@/components/ui/button';
import type { OldProcurementIssue } from '@/types/supplier-stock.types';

const phDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Old free-text "Report Procurement Issue" notes still open. Each one is turned
 * into a status (sales then get asked) or closed if it no longer applies.
 */
export function OldIssuesList({
  issues, onSetStatus, onClose,
}: {
  issues: OldProcurementIssue[];
  onSetStatus: (issue: OldProcurementIssue) => void;
  onClose: (issue: OldProcurementIssue) => void;
}) {
  if (issues.length === 0) return null;
  return (
    <details className="rounded-lg border border-slate-300 dark:border-slate-700" open>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
        Old reports to review ({issues.length})
        <span className="ml-2 font-normal text-muted-foreground">from the old Report Issue button. Set a status, or close it if it&apos;s done.</span>
      </summary>
      <ul className="divide-y border-t">
        {issues.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words">{i.productName}</p>
              <p className="text-xs text-muted-foreground break-words">“{i.note}” · {i.byName || '—'} · {phDate(i.createdAt)}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onSetStatus(i)}>Set status</Button>
            <Button size="sm" variant="ghost" onClick={() => onClose(i)}>Close</Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
