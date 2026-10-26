'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { CarryOver } from '@/lib/services/carryover-service';

const peso = (n: number) => `₱${(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }).format(new Date(iso));

/**
 * Items customers are still owed from earlier orders ("to follow"). They get
 * added from the New Order form when the customer orders again.
 */
export function CarryOverList({ canCancel, search, onCount }: { canCancel: boolean; search: string; onCount: (n: number) => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState<CarryOver[]>([]);
  const [ready, setReady] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/priority/carryovers', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setItems(data.carryOvers);
      setReady(data.ready);
      onCount(data.carryOvers.length);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not load to-follow items', description: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast, onCount]);

  useEffect(() => { load(); }, [load]);

  const cancel = async (c: CarryOver) => {
    if (!window.confirm(`Remove "${c.qty}× ${c.productName}" from ${c.customerName || 'this customer'}'s to-follow list? Do this only if the customer no longer wants it.`)) return;
    const res = await fetch('/api/priority/carryovers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', ids: [c.id], status: 'cancelled' }),
    });
    const data = await res.json();
    if (!res.ok) return toast({ variant: 'destructive', title: 'Could not remove', description: data.error });
    toast({ title: 'Removed from to-follow' });
    load();
  };

  const byCustomer = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, CarryOver[]>();
    items
      .filter((c) => !q || (c.customerName || '').toLowerCase().includes(q) || c.productName.toLowerCase().includes(q))
      .forEach((c) => map.set(c.customerId, [...(map.get(c.customerId) || []), c]));
    return Array.from(map.values());
  }, [items, search]);

  if (!ready) {
    return <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">To-follow items are not set up yet — run scripts/migrations/add_os_decisions_and_carryovers.sql.</div>;
  }
  if (isLoading && items.length === 0) return <Skeleton className="h-32 w-full" />;
  if (byCustomer.length === 0) {
    return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No items to follow.</div>;
  }

  return (
    <div className="space-y-2">
      {byCustomer.map((list) => {
        const total = list.reduce((s, c) => s + c.qty * c.unitPrice, 0);
        return (
          <div key={list[0].customerId} className="rounded-lg border bg-card p-3 sm:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/dashboard/customers/${list[0].customerId}`} className="font-semibold hover:underline">{list[0].customerName || 'Customer'}</Link>
              <span className="text-sm text-muted-foreground">{peso(total)} worth to follow</span>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {list.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-2">
                  <span>{c.qty}× {c.productName}</span>
                  <span className="text-muted-foreground">
                    — {peso(c.unitPrice)} each, from{' '}
                    {c.fromOrderId ? <Link href={`/dashboard/orders/${c.fromOrderId}`} className="underline">#{c.fromOrderId.slice(0, 7).toUpperCase()}</Link> : 'an earlier order'}
                    , {shortDate(c.createdAt)} by {c.createdByName || '—'}
                    {c.note && ` · “${c.note}”`}
                  </span>
                  {canCancel && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => cancel(c)}>
                      <X className="mr-1 h-3 w-3" />Not needed
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">When one of these customers orders again, the New Order form shows their to-follow items with an &quot;Add&quot; button.</p>
    </div>
  );
}
