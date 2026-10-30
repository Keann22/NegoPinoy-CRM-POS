'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  CustomerReturnAction,
  CustomerReturnsResponse,
  NewCustomerReturn,
  ReturnableOrderLine,
} from '@/types/customer-returns.types';

const API = '/api/inventory/customer-returns';

async function send(method: 'POST' | 'PATCH', body: unknown) {
  const res = await fetch(API, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong');
  return json;
}

/** Customer return cases and the actions on them. */
export function useCustomerReturns() {
  const [data, setData] = useState<CustomerReturnsResponse | null>(null);
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

  const act = useCallback(async (action: CustomerReturnAction) => {
    await send('PATCH', action);
    await refresh();
  }, [refresh]);

  return { data, isLoading, error, refresh, act };
}

/** An order's lines, for picking which pieces a new case covers. */
export async function fetchReturnableLines(orderId: string): Promise<ReturnableOrderLine[]> {
  const res = await fetch(`${API}?orderId=${encodeURIComponent(orderId)}`, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not load the order');
  return json.lines || [];
}

export async function openCustomerReturn(input: NewCustomerReturn) {
  return (await send('POST', input)) as { id: string; caseNo: number };
}

export async function patchCustomerReturn(action: CustomerReturnAction) {
  await send('PATCH', action);
}

/** After courier sync: open RTS cases for orders it just marked Returned. */
export async function openCasesForCourierReturns(orderIds: string[]) {
  if (orderIds.length === 0) return 0;
  const json = await send('POST', { action: 'courier_rts', orderIds });
  return Number(json.opened) || 0;
}

export interface OldReturnRecord {
  id: string;
  order_id: string;
  product_name: string | null;
  quantity: number;
  return_type: string;
  notes: string | null;
  created_at: string;
}

/** Rows from the old "Process return" log (read-only history). */
export async function fetchOldReturnsLog(): Promise<OldReturnRecord[]> {
  const res = await fetch('/api/inventory/returns', { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not load the old log');
  return json.returns || [];
}

/** Uploads one damage photo and returns its URL. */
export async function uploadReturnPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/photo`, { method: 'POST', body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Photo upload failed');
  return json.url as string;
}
