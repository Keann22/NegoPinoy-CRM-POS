import { useState, useEffect, useCallback, useRef } from 'react';
import type { OnlineOrderSearchResult } from '@/types';

export function useOnlineOrderSearch(initialOpen: boolean = false) {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<'all' | 'pinduoduo' | 'shopee'>('all');
  const [status, setStatus] = useState<'all' | 'pending' | 'received'>('all');
  const [orders, setOrders] = useState<OnlineOrderSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchOrders = useCallback(async (searchQuery: string, plat: string, stat: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (plat !== 'all') params.set('platform', plat);
      if (stat !== 'all') params.set('status', stat);

      const res = await fetch(`/api/inventory/procurement/online-orders/search?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to search online orders');
      }
      const data = await res.json();
      setOrders(data.orders || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred';
      setError(msg);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialOpen) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchOrders(query, platform, status);
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [initialOpen, query, platform, status, fetchOrders]);

  const refresh = useCallback(() => {
    fetchOrders(query, platform, status);
  }, [fetchOrders, query, platform, status]);

  const clear = useCallback(() => {
    setQuery('');
    setPlatform('all');
    setStatus('all');
  }, []);

  return {
    query,
    setQuery,
    platform,
    setPlatform,
    status,
    setStatus,
    orders,
    loading,
    error,
    refresh,
    clear,
  };
}
