'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, PackageCheck, Printer, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PickSkipDialog } from '@/components/dashboard/tasks/pick-skip-dialog';
import { ReadyToPickOrderCard } from '@/components/dashboard/tasks/ready-to-pick-order-card';
import { ReadyToPickParkedLists } from '@/components/dashboard/tasks/ready-to-pick-parked';
import { ReadyToPickPrintList } from '@/components/dashboard/tasks/ready-to-pick-print-list';
import { printOnly } from '@/components/print-portal';
import { useReadyToPick } from '@/hooks/useReadyToPick';
import { useReprintOrders } from '@/hooks/useReprintOrders';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { cn } from '@/lib/utils';
import type { OrderChangeNotice, OrderItemChange } from '@/types/order-changes';
import type { ReadyToPickOrder } from '@/types/ready-to-pick.types';

type TabKey = 'pwi' | 'proc';

export function ReadyToPickList() {
  const { data, isLoading, error, reload } = useReadyToPick(true);
  const { reprint, busy: printingBatch, printView } = useReprintOrders();
  const { staff } = useStaffDirectory();
  const [tab, setTab] = useState<TabKey>('pwi');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [compactPrint, setCompactPrint] = useState(true);
  const [skipOrder, setSkipOrder] = useState<ReadyToPickOrder | null>(null);

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

  const rankedFiltered = useMemo(
    () => filtered.map((order, idx) => ({ order, rank: idx + 1 })),
    [filtered]
  );
  const selectedRanked = useMemo(
    () => rankedFiltered.filter(({ order }) => selectedIds.has(order.id)),
    [rankedFiltered, selectedIds]
  );
  const listToPrint = selectedRanked.length > 0 ? selectedRanked : rankedFiltered;
  const tabLabel = tab === 'pwi' ? 'Picked (with issue)' : 'Processing — New';
  const printFilters = [
    selectedRanked.length > 0 && `Selected (${selectedRanked.length} of ${filtered.length})`,
    query.trim() && `Search: ${query.trim()}`,
  ].filter(Boolean) as string[];

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
    await reprint(orderedIds, changesMap, {
      compact: compactPrint,
      confirmClear:
        matched.length > 0
          ? {
              count: matched.length,
              onConfirm: async () => {
                const r = await fetch('/api/orders/changes', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ orderIds: matched.map((n) => n.orderId), how: 'reprinted' }),
                });
                if (!r.ok) throw new Error('Could not mark orders as reprinted');
              },
            }
          : undefined,
    });
  };

  const tabBtn = (active: boolean) =>
    cn(
      'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
      active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
    );

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      {printView}
      <ReadyToPickPrintList items={listToPrint} tabLabel={tabLabel} filters={printFilters} />
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
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              size="sm"
              className="print:hidden bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={printOnly}
              disabled={filtered.length === 0 || printingBatch}
              title={
                selectedRanked.length > 0
                  ? 'Print a checklist of the selected orders (not full order forms)'
                  : 'Print a checklist of all orders shown below (not full order forms)'
              }
            >
              <Printer className="mr-1.5 h-4 w-4" />
              {selectedRanked.length > 0
                ? `Print List (${selectedRanked.length})`
                : `Print List (All ${filtered.length})`}
            </Button>
            <span className="hidden h-5 w-px bg-border sm:inline-block" aria-hidden="true" />
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
              Reprint Order Forms ({selectedIds.size})
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
          <ReadyToPickOrderCard
            key={order.id}
            order={order}
            index={idx}
            selected={selectedIds.has(order.id)}
            onToggle={() => toggleSelect(order.id)}
            onSkip={() => setSkipOrder(order)}
            staff={staff}
            onReload={() => void reload()}
          />
        ))}
      </div>

      <ReadyToPickParkedLists shipLater={data?.shipLater ?? []} askedSales={data?.askedSales ?? []} />
      <PickSkipDialog order={skipOrder} onOpenChange={(o) => { if (!o) setSkipOrder(null); }} onSaved={() => void reload()} />
    </div>
  );
}
