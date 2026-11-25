'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OwnerTodoResponse } from '@/types/owner-todo.types';
import type { HeldPickerCount } from '@/types/inventory-guardian.types';

const REFRESH_MS = 5 * 60 * 1000;

/** Owner to-do: what only the owners can do (owners only; worked out on the server). */
export function useOwnerTodo(enabled: boolean) {
  const [data, setData] = useState<OwnerTodoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/owner-todo', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not load the to-do list');
      setData(json as OwnerTodoResponse);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void Promise.resolve().then(reload);
    const timer = window.setInterval(reload, REFRESH_MS);
    const onFocus = () => { void reload(); };
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [enabled, reload]);

  return { data, error, reload };
}

/** Picker counts above the shelf number, waiting for the owners. */
export function useHeldPickerCounts() {
  const [held, setHeld] = useState<HeldPickerCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/owner-todo?view=held', { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Could not load');
        setHeld(json.held || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  return { held, error };
}
