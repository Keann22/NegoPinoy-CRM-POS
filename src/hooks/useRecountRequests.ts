'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RecountRequest } from '@/types/inventory-guardian.types';

const API = '/api/inventory/recount-requests';
const POLL_MS = 5 * 60 * 1000;

/** Open recount requests for Jas (empty for every other account). */
export function useRecountRequests() {
  const [requests, setRequests] = useState<RecountRequest[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(API, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setRequests(json.requests || []);
    } catch {
      // Offline or signed out: keep what we have.
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  const save = useCallback(async (id: string, unit1: number, unit2: number) => {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, unit1, unit2 }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Hindi na-save');
    await refresh();
  }, [refresh]);

  return { requests, refresh, save };
}
