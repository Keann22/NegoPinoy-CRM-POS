'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, ListTodo, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AssignTaskDialog } from '@/components/dashboard/tasks/assign-task-dialog';
import { useOwnerTodo } from '@/hooks/useOwnerTodo';
import { cn } from '@/lib/utils';
import type { FlaggedPayment, OwnerTodoItem } from '@/types/owner-todo.types';

/** Database times are UTC; show them in Philippine time. */
const pht = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const peso = (n: number) => `₱${Math.round(n || 0).toLocaleString('en-PH')}`;

const DOT: Record<OwnerTodoItem['level'], string> = {
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  plain: 'bg-slate-300 dark:bg-slate-600',
};

function FlaggedList({ rows }: { rows: FlaggedPayment[] }) {
  return (
    <ul className="mt-2 divide-y rounded-md border text-sm">
      {rows.slice(0, 30).map((f) => (
        <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
          <span className="min-w-0">
            {f.orderId ? (
              <Link href={`/dashboard/orders/${f.orderId}`} className="font-medium underline">
                #{f.orderId.slice(0, 7).toUpperCase()}
              </Link>
            ) : <span className="font-medium">No order</span>}
            <span className="ml-2 text-muted-foreground">{f.reason}</span>
          </span>
          <span className="shrink-0 tabular-nums">{peso(f.amount)} · {pht(f.createdAt)}</span>
        </li>
      ))}
      {rows.length > 30 && <li className="px-3 py-2 text-muted-foreground">and {rows.length - 30} more</li>}
    </ul>
  );
}

function Row({ item }: { item: OwnerTodoItem }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={cn('rounded-lg border p-3', item.level === 'red' && 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30')}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-2.5">
          <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', DOT[item.level])} aria-hidden />
          <div className="min-w-0">
            <p className="font-medium leading-snug">
              {item.title}
              {item.count > 0 && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{item.count.toLocaleString('en-PH')}</span>}
              {item.level === 'red' && <span className="ml-2 text-xs font-semibold text-red-700 dark:text-red-400">Overdue</span>}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{item.detail}</p>
            {item.flagged && item.flagged.length > 0 && (
              <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 inline-flex items-center gap-1 text-sm font-medium underline">
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {open ? 'Hide payments' : 'Show payments'}
              </button>
            )}
          </div>
        </div>
        <Button asChild size="sm" variant={item.level === 'red' ? 'default' : 'outline'} className="shrink-0 self-start">
          <Link href={item.href}>{item.actionLabel} <ArrowRight className="ml-1 h-4 w-4" /></Link>
        </Button>
      </div>
      {open && item.flagged && <FlaggedList rows={item.flagged} />}
    </li>
  );
}

/**
 * Owner to-do (owner, 2026-11-25): work only the owners can do (GCash statement,
 * SPX file, held counts, returns...), worked out from live data, so each row
 * clears itself once it's done. Plus a button for a task to yourself.
 */
export function OwnerTodoCard() {
  const { data, error, reload } = useOwnerTodo(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const items = data?.items || [];
  const red = items.filter((i) => i.level === 'red').length;

  return (
    <Card className={cn(red > 0 ? 'border-red-200 dark:border-red-900' : 'border-blue-200 dark:border-blue-900')}>
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListTodo className="h-5 w-5 text-blue-600" /> Only you can do these{data ? ` (${items.length})` : ''}
          </CardTitle>
          <CardDescription>
            Each line clears by itself once it&apos;s done.{data ? ` Checked ${pht(data.checkedAt)}.` : ''}
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" className="self-start" onClick={() => setAssignOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Task for me
        </Button>
      </CardHeader>
      <CardContent>
        {!data && !error && <p className="text-sm text-muted-foreground">Checking…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {data && items.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-green-600" /> All clear: nothing is waiting on you.</p>
        )}
        {items.length > 0 && <ul className="space-y-2">{items.map((i) => <Row key={i.key} item={i} />)}</ul>}
      </CardContent>
      <AssignTaskDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        forSelf
        onCreated={() => { void reload(); }}
      />
    </Card>
  );
}
