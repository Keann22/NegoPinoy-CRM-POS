'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReadyToPickResponse } from '@/types/ready-to-pick.types';

export function useReadyToPick(enabled = true) {
  const [data, setData] = useState<ReadyToPickResponse | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tasks/ready-to-pick', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load ready-to-pick orders');
      setData(json as ReadyToPickResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  return { data, isLoading, error, reload };
}
