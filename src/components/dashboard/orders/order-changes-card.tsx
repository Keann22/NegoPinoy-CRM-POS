'use client';

import Link from 'next/link';
import { Check, FileWarning, Loader2, Printer } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useOrderChanges } from '@/hooks/useOrderChanges';
import { useReprintOrders } from '@/hooks/useReprintOrders';
import { describeChange } from '@/lib/services/orders/order-change-rules';
import { ReprintOrderSearch } from './reprint-order-search';
import type { OrderChangeNotice } from '@/types/order-changes';
import { cn } from '@/lib/utils';

const KIND_STYLE = {
  added: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  more: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  removed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  less: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
} as const;

const manilaTime = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) === new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
  return d.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    ...(sameDay ? {} : { month: 'short', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  });
};

/**
 * Orders the customer changed after the form was printed (Inventory and owners'
 * dashboards). Each one: what was added / removed, Reprint, Got it. Also a quick
 * "Reprint an order" search.
 */
export function OrderChangesCard() {
  const { toast } = useToast();
  const { notices, isLoading, error, handle } = useOrderChanges();
  const { reprint, busy, printView } = useReprintOrders();

  const reprintNotice = async (n: OrderChangeNotice) => {
    const ok = await reprint([n.orderId], { [n.orderId]: n.changes });
    if (!ok) return toast({ variant: 'destructive', title: 'Could not load the order to print' });
    handle([n.orderId], 'reprinted').catch((e) => toast({ variant: 'destructive', title: e.message }));
  };

  const reprintAll = async () => {
    const changes = Object.fromEntries(notices.map((n) => [n.orderId, n.changes]));
    const ids = notices.map((n) => n.orderId);
    const ok = await reprint(ids, changes);
    if (!ok) return toast({ variant: 'destructive', title: 'Could not load the orders to print' });
    handle(ids, 'reprinted').catch((e) => toast({ variant: 'destructive', title: e.message }));
  };

  const gotIt = (n: OrderChangeNotice) =>
    handle([n.orderId], 'seen').catch((e) => toast({ variant: 'destructive', title: e.message }));

  return (
    <Card className={cn(notices.length > 0 && 'border-amber-400 dark:border-amber-600')}>
      {printView}
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileWarning className={cn('h-5 w-5', notices.length > 0 ? 'text-amber-500' : 'text-muted-foreground')} />
              Orders changed after printing
              {notices.length > 0 && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{notices.length}</span>
              )}
            </CardTitle>
            <CardDescription>
              The customer added or removed items. Reprint the form and replace the old copy.
            </CardDescription>
          </div>
          {notices.length > 1 && (
            <Button size="sm" onClick={reprintAll} disabled={busy}>
              <Printer className="mr-1 h-4 w-4" /> Reprint all ({notices.length})
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!isLoading && !error && notices.length === 0 && (
          <p className="text-sm text-muted-foreground">No changed orders right now.</p>
        )}

        {notices.map((n) => (
          <div key={n.orderId} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <Link href={`/dashboard/orders/${n.orderId}`} className="font-mono font-semibold text-primary hover:underline">
                #{n.orderCode}
              </Link>
              <span className="font-medium">{n.customerName}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{n.status}</span>
              {n.afterPicking && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  Already picked
                </span>
              )}
            </div>

            <ul className="mt-2 space-y-1">
              {n.changes.map((c) => {
                const d = describeChange(c);
                return (
                  <li key={c.product_id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={cn('rounded px-1.5 py-0.5 text-xs font-semibold', KIND_STYLE[d.kind])}>{d.label}</span>
                    <span className={cn(d.kind === 'removed' && 'line-through text-muted-foreground')}>{c.name}</span>
                  </li>
                );
              })}
            </ul>

            {n.afterPicking && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                Pick the new items; put removed pieces back on the shelf.
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {n.changedBy.join(', ') || 'Someone'} · {manilaTime(n.lastChangedAt)}
                {n.editCount > 1 && ` · ${n.editCount} edits`}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => gotIt(n)}>
                  <Check className="mr-1 h-4 w-4" /> Got it
                </Button>
                <Button size="sm" onClick={() => reprintNotice(n)} disabled={busy}>
                  <Printer className="mr-1 h-4 w-4" /> Reprint
                </Button>
              </div>
            </div>
          </div>
        ))}

        <div className="border-t pt-3">
          <ReprintOrderSearch busy={busy} onReprint={(id) => reprint([id])} />
        </div>
      </CardContent>
    </Card>
  );
}
