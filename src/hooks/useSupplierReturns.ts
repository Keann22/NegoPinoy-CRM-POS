'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  NewSupplierReturn,
  SupplierReturnAction,
  SupplierReturnsResponse,
} from '@/types/supplier-returns.types';

const API = '/api/inventory/supplier-returns';

async function send(method: 'POST' | 'PATCH', body: unknown) {
  const res = await fetch(API, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong');
  return json;
}

/** Supplier Returns data and actions. Supplier names and costs only arrive for owners. */
export function useSupplierReturns() {
  const [data, setData] = useState<SupplierReturnsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(API, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load returns');
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const reportDamaged = useCallback(async (input: NewSupplierReturn) => {
    const out = await send('POST', input);
    await refresh();
    return out as { id: string; returnNo: number };
  }, [refresh]);

  const act = useCallback(async (action: SupplierReturnAction) => {
    await send('PATCH', action);
    await refresh();
  }, [refresh]);

  const setSupplierDays = useCallback(async (supplierId: string, days: number) => {
    await send('PATCH', { action: 'supplier_days', supplierId, days });
    await refresh();
  }, [refresh]);

  return { data, isLoading, error, refresh, reportDamaged, act, setSupplierDays };
}

/** Report damaged from anywhere (e.g. the Inventory List) without loading the list. */
export async function reportDamagedItem(input: NewSupplierReturn) {
  return (await send('POST', input)) as { id: string; returnNo: number };
}
