'use client';

import { useState, useEffect, useCallback } from 'react';
import type { InventoryCountProgressSummary } from '@/types/inventory-guardian.types';

export function useInventoryCountProgress(days = 14) {
  const [progress, setProgress] = useState<InventoryCountProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/inventory/count-progress?days=${days}`);
      if (!res.ok) {
        throw new Error(`Failed to load count progress (${res.status})`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProgress(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  return { progress, loading, error, refresh: fetchProgress };
}
