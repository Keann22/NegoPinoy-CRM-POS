'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, ExternalLink, Loader2, PackageCheck, Printer, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ReprintOrderButton } from '@/components/dashboard/orders/reprint-order-button';
import { useReadyToPick } from '@/hooks/useReadyToPick';
import { useReprintOrders } from '@/hooks/useReprintOrders';
import { cn } from '@/lib/utils';
import type { OrderChangeNotice, OrderItemChange } from '@/types/order-changes';
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
  const { reprint, busy: printingBatch, printView } = useReprintOrders();
  const [tab, setTab] = useState<TabKey>('pwi');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [compactPrint, setCompactPrint] = useState(true);

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

  const switchTab = (next: TabKey) => {
    setTab(next);
    setSelectedIds(new Set());
  };

  const toggleSelect = (orderId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((o) => selectedIds.has(o.id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((o) => next.delete(o.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((o) => next.add(o.id));
        return next;
      });
    }
  };

  const handleBatchReprint = async () => {
    const orderedIds = activeOrders.filter((o) => selectedIds.has(o.id)).map((o) => o.id);
    if (orderedIds.length === 0) return;
    const res = await fetch('/api/orders/changes', { cache: 'no-store' }).catch(() => null);
    const json = res?.ok ? await res.json() : { notices: [] };
    const idSet = new Set(orderedIds);
    const matched = ((json.notices || []) as OrderChangeNotice[]).filter((n) => idSet.has(n.orderId));
    const changesMap: Record<string, OrderItemChange[]> = {};
    matched.forEach((n) => { changesMap[n.orderId] = n.changes; });
    const ok = await reprint(orderedIds, changesMap, { compact: compactPrint });
    if (ok && matched.length > 0) {
      await fetch('/api/orders/changes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: matched.map((n) => n.orderId), how: 'reprinted' }),
      }).catch(() => {});
    }
  };

  const tabBtn = (active: boolean) =>
    cn(
      'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
      active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
    );

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      {printView}
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
          <button type="button" className={tabBtn(tab === 'pwi')} onClick={() => switchTab('pwi')}>
            Picked (with issue) ({pwiOrders.length})
          </button>
          <button type="button" className={tabBtn(tab === 'proc')} onClick={() => switchTab('proc')}>
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

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 font-medium">
              <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} />
              <span>Select all ({filtered.length})</span>
            </label>
            {selectedIds.size > 0 && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline hover:text-foreground"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear ({selectedIds.size})
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={compactPrint} onCheckedChange={(v) => setCompactPrint(Boolean(v))} />
              <span>Compact (combine on same paper)</span>
            </label>
            <Button
              size="sm"
              variant={selectedIds.size > 0 ? 'default' : 'outline'}
              disabled={selectedIds.size === 0 || printingBatch}
              onClick={() => void handleBatchReprint()}
            >
              {printingBatch ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-1.5 h-4 w-4" />
              )}
              Reprint Selected ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}

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
          <Card
            key={order.id}
            className={cn(
              order.isPaid && 'border-emerald-300 dark:border-emerald-800',
              selectedIds.has(order.id) && 'ring-2 ring-primary'
            )}
          >
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    checked={selectedIds.has(order.id)}
                    onCheckedChange={() => toggleSelect(order.id)}
                    aria-label={`Select order #${order.orderNo}`}
                    className="mt-1"
                  />
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
