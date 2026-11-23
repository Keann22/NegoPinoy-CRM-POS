'use client';

import { useCallback, useEffect, useState } from 'react';

const SNOOZE_MS = 30 * 60 * 1000;

function readUntil(storageKey: string): number {
  try {
    return Number(window.localStorage.getItem(storageKey)) || 0;
  } catch {
    return 0;
  }
}

function writeUntil(storageKey: string, until: number) {
  try {
    if (until > 0) window.localStorage.setItem(storageKey, String(until));
    else window.localStorage.removeItem(storageKey);
  } catch {
    // Private mode or blocked storage: "Later" then only lasts until a reload.
  }
}

/**
 * "Later (comes back in 30 minutes)" for the sticky pop-ups. Remembered in the
 * browser, so a reload, a new tab or a save that reloads the page doesn't bring
 * the pop-up straight back (found 2026-11-23: it reopened on every page load).
 * `onReopen` runs when the 30 minutes are up.
 */
export function usePopupSnooze(key: string, onReopen?: () => void) {
  const storageKey = `popup-snooze:${key}`;
  const [until, setUntil] = useState(0);

  useEffect(() => {
    const saved = readUntil(storageKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after mount
    if (saved > Date.now()) setUntil(saved);
  }, [storageKey]);

  useEffect(() => {
    if (until <= Date.now()) return;
    const t = window.setTimeout(() => {
      setUntil(0);
      writeUntil(storageKey, 0);
      onReopen?.();
    }, until - Date.now());
    return () => window.clearTimeout(t);
  }, [until, storageKey, onReopen]);

  const setMinimized = useCallback(
    (minimize: boolean) => {
      const next = minimize ? Date.now() + SNOOZE_MS : 0;
      setUntil(next);
      writeUntil(storageKey, next);
    },
    [storageKey]
  );

  return { minimized: until > 0, setMinimized };
}
