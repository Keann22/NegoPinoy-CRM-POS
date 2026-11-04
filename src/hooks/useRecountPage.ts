'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RecountPageRow } from '@/types/inventory-guardian.types';

const API = '/api/inventory/recount-requests';

/** The Pabilang page: open and counted lines of every unfinished recount batch. */
export function useRecountPage() {
  const [rows, setRows] = useState<RecountPageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}?view=page`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Hindi ma-load');
      setRows(json.rows || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const save = useCallback(async (id: string, unit1: number, unit2: number) => {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, unit1, unit2 }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Hindi na-save');
    await refresh();
  }, [refresh]);

  return { rows, loading, error, refresh, save };
}
