'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, ExternalLink, PackageCheck, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ReprintOrderButton } from '@/components/dashboard/orders/reprint-order-button';
import { useReadyToPick } from '@/hooks/useReadyToPick';
import { cn } from '@/lib/utils';
import type { ReadyToPickOrder } from '@/types/ready-to-pick.types';

type TabKey = 'pwi' | 'proc';

function formatPhtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: '2-digit',
  });
}

function paymentLabel(o: ReadyToPickOrder): string {
  if (o.paymentMethod === 'Lay-away' && o.isPaid) return 'Lay-away (Paid)';
  if (o.paymentMethod === 'Lay-away') return `Lay-away (${o.paidPercent}%)`;
  if (o.isPaid) return `${o.paymentMethod || 'Order'} (Paid)`;
  return o.paymentMethod || 'COD';
}

export function ReadyToPickList() {
  const { data, isLoading, error, reload } = useReadyToPick(true);
  const [tab, setTab] = useState<TabKey>('pwi');
  const [query, setQuery] = useState('');

  const pwiOrders = data?.pickedWithIssue ?? [];
  const procOrders = data?.processing ?? [];
  const activeOrders = tab === 'pwi' ? pwiOrders : procOrders;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeOrders;
    return activeOrders.filter(
      (o) =>
        o.orderNo.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.items.some((i) => i.name.toLowerCase().includes(q))
    );
  }, [activeOrders, query]);

  const tabBtn = (active: boolean) =>
    cn(
      'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
      active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
    );

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/dashboard/tasks"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Tasks
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <PackageCheck className="h-6 w-6 text-emerald-600" />
            Ready to Pick (Stock Available)
          </h1>
          <p className="text-sm text-muted-foreground">
            Check the order form, pick the items (Jas or warehouse staff), then continue the normal workflow.
            Orders disappear here automatically once picked.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void reload()} disabled={isLoading}>
          <RefreshCw className={cn('mr-1.5 h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={tabBtn(tab === 'pwi')} onClick={() => setTab('pwi')}>
            Picked (with issue) ({pwiOrders.length})
          </button>
          <button type="button" className={tabBtn(tab === 'proc')} onClick={() => setTab('proc')}>
            Processing — New ({procOrders.length})
          </button>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order #, customer, item…"
            className="pl-8"
          />
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {isLoading && !data && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading orders with stock on the shelf…
          </CardContent>
        </Card>
      )}

      {!isLoading && data && filtered.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {query.trim()
              ? 'No matching orders found.'
              : tab === 'pwi'
                ? 'All Picked (with issue) orders with available stock have been picked!'
                : 'No Processing orders ready to pick right now.'}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {filtered.map((order, idx) => (
          <Card key={order.id} className={cn(order.isPaid && 'border-emerald-300 dark:border-emerald-800')}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <span className="text-muted-foreground">#{idx + 1}</span>
                    <span className="font-mono font-bold">#{order.orderNo}</span>
                    <span>{order.customerName}</span>
                    <Badge variant={order.isPaid ? 'default' : 'secondary'} className={cn(order.isPaid && 'bg-emerald-600 hover:bg-emerald-600')}>
                      {paymentLabel(order)}
                    </Badge>
                    {order.noOpenIssue && (
                      <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
                        Re-pick to clear status
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Ordered {formatPhtDate(order.orderDate)}
                    {order.salesPersonName ? ` · Sales: ${order.salesPersonName}` : ''}
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/orders/${order.id}`} target="_blank">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Order Form
                    </Link>
                  </Button>
                  <ReprintOrderButton orderId={order.id} />
                  <Button asChild size="sm">
                    <Link href={`/dashboard/pick?order=${order.id}`}>
                      <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                      Pick Now
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <ul className="divide-y rounded-md border bg-muted/30 text-sm">
                {order.items.map((item) => (
                  <li key={item.productId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="font-medium">{item.name}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="font-mono">
                        Need {item.neededQty}
                      </Badge>
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        Shelf: {item.shelfStock}
                      </span>
                      {item.shelfLocation && (
                        <span className="rounded bg-muted px-1.5 py-0.5">{item.shelfLocation}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
