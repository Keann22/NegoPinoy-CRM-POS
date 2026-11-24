'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEFAULT_CHECK_DAYS, addDaysPht, shortPhtDate } from '@/lib/shipping/ship-hold-rules';
import { cn } from '@/lib/utils';
import { SHIP_HOLD_KINDS, type ShipHoldAnswer, type ShipHoldPrompt } from '@/types/ship-holds.types';
import { ShipHoldOrdersList } from './ship-hold-orders-list';

const phDate = (iso: string) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }).format(new Date(iso));

interface Props {
  prompt: ShipHoldPrompt;
  busy: boolean;
  onAnswer: (answer: ShipHoldAnswer, checkOn?: string) => void;
  onEdit: () => void;
}

/** One held order (or ship-together group) in the pop-up, with the agent's answers. */
export function ShipHoldPromptCard({ prompt: p, busy, onAnswer, onEdit }: Props) {
  const [askDate, setAskDate] = useState<string | null>(null);
  const d = p.detail;
  const title = p.reason === 'complete'
    ? d.kind === 'payment' ? 'Bayad na: pwede na ipadala' : 'Kumpleto na: pwede na ipadala'
    : 'Ready na ba?';
  return (
    <li className={cn('space-y-2 rounded-md border p-3', p.reason === 'complete' && 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30')}>
      <div className="text-sm">
        <p className={cn('font-semibold', p.reason === 'complete' ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300')}>{title}</p>
        <p className="font-medium">{p.customerName}{p.salesPersonName ? <span className="font-normal text-muted-foreground"> · {p.salesPersonName}</span> : null}</p>
        <p className="text-xs text-muted-foreground">
          {SHIP_HOLD_KINDS[d.kind].label}{d.shipVia === 'bus' ? ' · by bus' : ''}
          {' · '}held {phDate(p.heldSince)}{p.heldByName ? ` by ${p.heldByName}` : ''}
          {p.reason === 'check' && ` · ask date ${shortPhtDate(d.checkOn)}`}
        </p>
        {(d.note || p.holdText) && <p className="pt-1 text-xs">&ldquo;{d.note || p.holdText}&rdquo;</p>}
        {p.overdue && <p className="pt-1 text-xs font-medium text-red-700 dark:text-red-300">No answer from sales for 3+ days.</p>}
      </div>

      <ShipHoldOrdersList orders={d.orders} />
      {!d.complete && d.kind === 'with_orders' && (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Not all of them are ready. &ldquo;Ready na&rdquo; lets these go without waiting for the rest.
        </p>
      )}

      {askDate === null ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => onAnswer('release')}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Ready na: ipadala
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setAskDate(addDaysPht(DEFAULT_CHECK_DAYS))}>Hindi pa</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAnswer('waiting')}>Asked customer, waiting</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onEdit}>Change hold</Button>
          <Button size="sm" variant="link" asChild className="px-1">
            <Link href={`/dashboard/orders/${d.orders[0]?.id}`}>Open order</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">Tanungin ulit sa</span>
          <Input type="date" min={addDaysPht(1)} value={askDate} onChange={(e) => setAskDate(e.target.value)} className="h-8 w-40" />
          <Button size="sm" disabled={busy || !askDate} onClick={() => onAnswer('not_yet', askDate)}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setAskDate(null)}>Back</Button>
        </div>
      )}
    </li>
  );
}
