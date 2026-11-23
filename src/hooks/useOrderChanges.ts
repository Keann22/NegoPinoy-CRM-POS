'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OrderChangeAction, OrderChangeNotice } from '@/types/order-changes';

/** Open "order changed after printing" notices; refreshes every minute. */
export function useOrderChanges() {
  const [notices, setNotices] = useState<OrderChangeNotice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/orders/changes', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load order changes');
      setNotices(json.notices || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  const handle = useCallback(async (orderIds: string[], how: OrderChangeAction) => {
    setNotices((prev) => prev.filter((n) => !orderIds.includes(n.orderId)));
    const res = await fetch('/api/orders/changes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderIds, how }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      await load();
      throw new Error(json.error || 'Could not save');
    }
  }, [load]);

  return { notices, isLoading, error, reload: load, handle };
}
