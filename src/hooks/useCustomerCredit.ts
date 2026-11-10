import { useState, useEffect, useCallback } from 'react';
import type { CustomerCreditInfo } from '@/types/store-credit.types';

export function useCustomerCredit(orderId: string | null | undefined, open: boolean) {
  const [info, setInfo] = useState<CustomerCreditInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId || !open) {
      setInfo(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/store-credit?orderId=${encodeURIComponent(orderId)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch customer credit');
      }
      setInfo(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [orderId, open]);

  useEffect(() => {
    load();
  }, [load]);

  return { info, loading, error, refetch: load };
}
