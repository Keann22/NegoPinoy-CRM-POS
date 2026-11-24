'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PICK_SKIP_REASONS, type PickQuestion, type PickSkipAnswer } from '@/types/pick-skips.types';

const phDate = (iso: string) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }).format(new Date(iso));

interface Props {
  question: PickQuestion;
  busy: boolean;
  onAnswer: (answer: PickSkipAnswer) => void;
  /** Opens the hold dialog on "Ipadala sa petsa". */
  onSetDate: () => void;
}

/** "Hindi pa ipi-pick" (owner, 2026-11-25): the warehouse asks sales whether the order ships later. */
export function PickQuestionCard({ question: q, busy, onAnswer, onSetDate }: Props) {
  return (
    <li className="space-y-2 rounded-md border border-sky-300 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/30">
      <div className="text-sm">
        <p className="font-semibold text-sky-800 dark:text-sky-300">Hindi pa na-pick: kailan ipapadala?</p>
        <p className="font-medium">
          <span className="font-mono">{q.shortId}</span> · {q.customerName}
          {q.salesPersonName ? <span className="font-normal text-muted-foreground"> · {q.salesPersonName}</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {PICK_SKIP_REASONS[q.reason].label} · {q.byName || 'Warehouse'}, {phDate(q.at)} · {q.status}
        </p>
        {q.note && <p className="pt-1 text-xs">&ldquo;{q.note}&rdquo;</p>}
        {q.overdue && <p className="pt-1 text-xs font-medium text-red-700 dark:text-red-300">No answer from sales for 3+ days.</p>}
        <p className="pt-1 text-xs text-muted-foreground">
          A later date keeps it off picking until 3 days before, so the stock on the shelf can go to other orders.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={onSetDate}>Ipadala sa petsa…</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onAnswer('pick_now')}>
          {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}I-pick na ngayon
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAnswer('waiting')}>Asked customer, waiting</Button>
        <Button size="sm" variant="link" asChild className="px-1">
          <Link href={`/dashboard/orders/${q.orderId}`}>Open order</Link>
        </Button>
      </div>
    </li>
  );
}
