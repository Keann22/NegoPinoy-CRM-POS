'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { busOrdersForOrder, searchBusOrders } from '@/hooks/useBusShipping';
import type { BusCandidateOrder } from '@/types/bus-shipping.types';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

interface Props {
  /** Opened from an order ("Ship by bus"): load that customer and tick the order. */
  initialOrderId?: string | null;
  selected: BusCandidateOrder[];
  onChange: (orders: BusCandidateOrder[]) => void;
}

/** Find the customer by order # or name, then tick the orders that went on this bus. */
export function BusOrderPicker({ initialOrderId, selected, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BusCandidateOrder[]>([]);
  const [loading, setLoading] = useState(!!initialOrderId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialOrderId) return;
    busOrdersForOrder(initialOrderId)
      .then((orders) => {
        setResults(orders);
        const first = orders.find((o) => o.id === initialOrderId && o.canShip);
        if (first) onChange([first]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // Only when opened from an order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrderId]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const t = setTimeout(() => {
      setLoading(true);
      searchBusOrders(q)
        .then((orders) => { setResults(orders); setError(null); })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const byCustomer = useMemo(() => {
    const groups = new Map<string, BusCandidateOrder[]>();
    for (const o of results) {
      const key = o.customerId || o.id;
      groups.set(key, [...(groups.get(key) || []), o]);
    }
    return [...groups.values()];
  }, [results]);

  const selectedIds = new Set(selected.map((o) => o.id));
  const toggle = (o: BusCandidateOrder) => {
    if (selectedIds.has(o.id)) return onChange(selected.filter((s) => s.id !== o.id));
    // One trip = one customer: ticking another customer's order starts over.
    const sameCustomer = selected.filter((s) => s.customerId && s.customerId === o.customerId);
    onChange([...sameCustomer, o]);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Order # or customer name"
          className="h-11 pl-9 text-base"
          autoCapitalize="none"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && query.trim().length >= 3 && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No orders found for “{query.trim()}”.</p>
      )}

      {byCustomer.map((orders) => (
        <div key={orders[0].customerId || orders[0].id} className="rounded-md border">
          <p className="border-b bg-muted/40 px-3 py-2 text-sm font-semibold">{orders[0].customerName}</p>
          <ul className="divide-y">
            {orders.map((o) => (
              <li key={o.id}>
                <label className={`flex gap-3 px-3 py-3 ${o.canShip ? 'cursor-pointer' : 'opacity-60'}`}>
                  <Checkbox
                    className="mt-0.5 h-5 w-5"
                    checked={selectedIds.has(o.id)}
                    disabled={!o.canShip}
                    onCheckedChange={() => toggle(o)}
                  />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="flex flex-wrap items-center gap-x-2 text-sm">
                      <span className="font-mono font-semibold">#{o.shortId}</span>
                      <span className="text-xs text-muted-foreground">{o.status}</span>
                      <span className="ml-auto text-xs">{peso(o.itemValue)}</span>
                    </span>
                    <span className="block break-words text-xs text-muted-foreground">{o.items}</span>
                    {o.advance > 0 && (
                      <span className="block text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        Paid {peso(o.advance)} above the items (SF sent in advance?)
                      </span>
                    )}
                    {o.blockedReason && <span className="block text-xs text-amber-700 dark:text-amber-400">{o.blockedReason}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
