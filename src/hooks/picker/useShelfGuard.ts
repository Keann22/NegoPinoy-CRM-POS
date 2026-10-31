'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PickRow } from './types';
import type { PickerShelfInfo } from '@/types/inventory-guardian.types';

/*
 * Picker shelf guard (owner rule 2026-10-31, docs/BUSINESS_WORKFLOW.md
 * "Picking when the shelf says there's not enough"):
 *   - Found for more than the shelf has → count the Unit 1 shelf first (or block).
 *   - Borrow while the shelf has stock → confirm Unit 1 and Unit 2 are empty first.
 * If the shelf numbers can't be loaded, nothing is blocked (the warehouse keeps working).
 */

export type ShelfPrompt =
  | { kind: 'count'; rowKey: string; productId: string; productName: string; needed: number; unit2: number }
  | { kind: 'borrow'; rowKey: string; productId: string; productName: string; available: number; unit2: number };

interface Marks {
  markFound: (rowKey: string) => void;
  markOutOfStock: (rowKey: string, fullQty: number) => void;
  setMissingQty: (rowKey: string, raw: string) => void;
}

export function useShelfGuard(orderId: string | null, rows: PickRow[], marks: Marks) {
  const [shelf, setShelf] = useState<Record<string, PickerShelfInfo> | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [prompt, setPrompt] = useState<ShelfPrompt | null>(null);
  const [pendingBorrow, setPendingBorrow] = useState<(() => void) | null>(null);

  const productIds = useMemo(() => Array.from(new Set(rows.map((r) => r.productId))).sort().join(','), [rows]);

  const load = useCallback(async () => {
    if (!orderId || !productIds) return;
    try {
      const res = await fetch(`/api/picker/shelf?orderId=${encodeURIComponent(orderId)}&productIds=${encodeURIComponent(productIds)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setShelf(json.shelf || {});
      setPicked(json.picked || {});
    } catch (e) {
      console.error('Shelf guard: could not load shelf numbers', e);
      setShelf(null);
    }
  }, [orderId, productIds]);

  useEffect(() => {
    setShelf(null);
    setPicked({});
    setPrompt(null);
    load();
  }, [load]);

  /** Pieces of this product the order still has to take off the shelf. */
  const neededFor = useCallback((productId: string) => {
    const total = rows.filter((r) => r.productId === productId).reduce((s, r) => s + r.quantity, 0);
    return Math.max(0, total - (picked[productId] || 0));
  }, [rows, picked]);

  const onFound = useCallback((row: PickRow) => {
    const info = shelf?.[row.productId];
    const needed = neededFor(row.productId);
    if (!info || needed === 0 || info.unallocated >= needed) return marks.markFound(row.key);
    setPrompt({ kind: 'count', rowKey: row.key, productId: row.productId, productName: row.productName, needed, unit2: info.unit2 });
  }, [shelf, neededFor, marks]);

  const beforeBorrow = useCallback((row: PickRow, openBorrow: () => void) => {
    const info = shelf?.[row.productId];
    if (!info || info.unallocated <= 0) return openBorrow();
    setPendingBorrow(() => openBorrow);
    setPrompt({ kind: 'borrow', rowKey: row.key, productId: row.productId, productName: row.productName, available: info.unallocated, unit2: info.unit2 });
  }, [shelf]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/picker/shelf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, orderId }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Could not save the count');
    return json as { before: number; after: number };
  };

  /** Saves the Unit 1 count; marks Found for what it covers and OS for the rest. */
  const submitCount = async (unit1Count: number) => {
    if (prompt?.kind !== 'count') return;
    const { rowKey, needed } = prompt;
    const row = rows.find((r) => r.key === rowKey);
    const { after } = await post({ productId: prompt.productId, unit1Count });
    if (after >= needed) marks.markFound(rowKey);
    else if (row) {
      marks.markOutOfStock(rowKey, row.quantity);
      marks.setMissingQty(rowKey, String(Math.min(row.quantity, needed - after)));
    }
    setPrompt(null);
    await load();
    return after >= needed;
  };

  /** "From a delivery that isn't recorded yet": blocked, the line becomes OS. */
  const notReceivedYet = () => {
    if (prompt?.kind !== 'count') return;
    const row = rows.find((r) => r.key === prompt.rowKey);
    if (row) marks.markOutOfStock(row.key, row.quantity);
    setPrompt(null);
  };

  /** "I checked Unit 1 and Unit 2, none there": saved as a count of 0, then borrow opens. */
  const confirmBothEmpty = async () => {
    if (prompt?.kind !== 'borrow') return;
    await post({ productId: prompt.productId, bothEmpty: true });
    const open = pendingBorrow;
    setPrompt(null);
    setPendingBorrow(null);
    await load();
    open?.();
  };

  const closePrompt = () => {
    setPrompt(null);
    setPendingBorrow(null);
  };

  return { prompt, onFound, beforeBorrow, submitCount, notReceivedYet, confirmBothEmpty, closePrompt };
}
