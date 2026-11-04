'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PickRow } from './types';
import type { PickerShelfInfo } from '@/types/inventory-guardian.types';
import type { ProductReservation, ReservedOrder } from '@/lib/services/inventory/reservation-service';

/*
 * Picker shelf guard (owner rule 2026-10-31, docs/BUSINESS_WORKFLOW.md
 * "Picking when the shelf says there's not enough"):
 *   - Found for more than the shelf has → count the Unit 1 shelf first (or block).
 *   - Borrow while the shelf has stock → confirm Unit 1 and Unit 2 are empty first.
 *   - Found when the pieces are reserved for another order's replacement → blocked
 *     (mark OS, or an owner overrides with a reason). Owner rule 2026-11-03.
 *   - OS while the system says the shelf has some → look again, or count the shelf
 *     (Unit 1, and confirm Unit 2 is empty) before OS goes through. Owner 2026-11-04.
 * If the shelf numbers can't be loaded, nothing is blocked (the warehouse keeps working).
 */

export type ShelfPrompt =
  | { kind: 'count'; rowKey: string; productId: string; productName: string; needed: number; unit2: number; deliveryWaiting: boolean }
  | { kind: 'os'; rowKey: string; productId: string; productName: string; needed: number; unit2: number; deliveryWaiting: boolean }
  | { kind: 'borrow'; rowKey: string; productId: string; productName: string; available: number; unit2: number }
  | { kind: 'reserved'; rowKey: string; productId: string; productName: string; needed: number; free: number; orders: ReservedOrder[] };

/** What a saved count led to (for the picker's message). */
export type CountOutcome = 'found' | 'os' | 'reserved';

interface Marks {
  markFound: (rowKey: string) => void;
  markOutOfStock: (rowKey: string, fullQty: number) => void;
  setMissingQty: (rowKey: string, raw: string) => void;
}

export function useShelfGuard(orderId: string | null, rows: PickRow[], marks: Marks) {
  const [shelf, setShelf] = useState<Record<string, PickerShelfInfo> | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [pendingDelivery, setPendingDelivery] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState<ShelfPrompt | null>(null);
  const [pendingBorrow, setPendingBorrow] = useState<(() => void) | null>(null);
  const [reserved, setReserved] = useState<Record<string, ProductReservation>>({});
  // Products an owner already released for this order (no second prompt).
  const [released, setReleased] = useState<Set<string>>(new Set());

  const productIds = useMemo(() => Array.from(new Set(rows.map((r) => r.productId))).sort().join(','), [rows]);

  const load = useCallback(async () => {
    if (!orderId || !productIds) return;
    try {
      const res = await fetch(`/api/picker/shelf?orderId=${encodeURIComponent(orderId)}&productIds=${encodeURIComponent(productIds)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setShelf(json.shelf || {});
      setPicked(json.picked || {});
      setPendingDelivery(new Set(json.pendingDelivery || []));
      setReserved(json.reserved || {});
    } catch (e) {
      console.error('Shelf guard: could not load shelf numbers', e);
      setShelf(null);
    }
  }, [orderId, productIds]);

  useEffect(() => {
    setShelf(null);
    setPicked({});
    setPrompt(null);
    setReserved({});
    setReleased(new Set());
    load();
  }, [load]);

  /** Pieces of this product the order still has to take off the shelf. */
  const neededFor = useCallback((productId: string) => {
    const total = rows.filter((r) => r.productId === productId).reduce((s, r) => s + r.quantity, 0);
    return Math.max(0, total - (picked[productId] || 0));
  }, [rows, picked]);

  /** Pieces of this product other orders reserved (0 once an owner released it here). */
  const reservedQty = useCallback((productId: string) =>
    released.has(productId) ? 0 : reserved[productId]?.qty || 0, [reserved, released]);

  const reservedPrompt = useCallback((row: PickRow, needed: number, onShelf: number) => {
    setPrompt({
      kind: 'reserved', rowKey: row.key, productId: row.productId, productName: row.productName,
      needed, free: Math.max(0, onShelf - reservedQty(row.productId)), orders: reserved[row.productId]?.orders || [],
    });
  }, [reserved, reservedQty]);

  const onFound = useCallback((row: PickRow) => {
    const info = shelf?.[row.productId];
    const needed = neededFor(row.productId);
    if (!info || needed === 0) return marks.markFound(row.key);
    if (info.unallocated >= needed) {
      // Enough on the shelf, unless some of it is reserved for a replacement.
      if (info.unallocated - reservedQty(row.productId) < needed) return reservedPrompt(row, needed, info.unallocated);
      return marks.markFound(row.key);
    }
    setPrompt({ kind: 'count', rowKey: row.key, productId: row.productId, productName: row.productName, needed, unit2: info.unit2, deliveryWaiting: pendingDelivery.has(row.productId) });
  }, [shelf, neededFor, marks, pendingDelivery, reservedQty, reservedPrompt]);

  /** OS tapped. If the system says free pieces are on the shelf, ask the picker to look again or count first. */
  const onOutOfStock = useCallback((row: PickRow, alreadyOS: boolean) => {
    const info = shelf?.[row.productId];
    const needed = neededFor(row.productId);
    const free = info ? info.unallocated - reservedQty(row.productId) : 0;
    if (alreadyOS || !info || needed === 0 || free <= 0) return marks.markOutOfStock(row.key, row.quantity);
    setPrompt({ kind: 'os', rowKey: row.key, productId: row.productId, productName: row.productName, needed, unit2: info.unit2, deliveryWaiting: pendingDelivery.has(row.productId) });
  }, [shelf, neededFor, marks, pendingDelivery, reservedQty]);

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

  /**
   * Saves the Unit 1 count; marks Found for what it covers and OS for the rest (reserved pieces don't count).
   * `unit2Empty`: the picker also found Unit 2 empty (OS prompt), so Unit 2 is zeroed instead of kept.
   */
  const submitCount = async (unit1Count: number, opts: { unit2Empty?: boolean } = {}): Promise<CountOutcome | undefined> => {
    if (prompt?.kind !== 'count' && prompt?.kind !== 'os') return;
    const { rowKey, needed } = prompt;
    const row = rows.find((r) => r.key === rowKey);
    const { after } = await post({ productId: prompt.productId, unit1Count, unit2Empty: !!opts.unit2Empty });
    const usable = Math.max(0, after - reservedQty(prompt.productId));
    if (usable >= needed) {
      marks.markFound(rowKey);
      setPrompt(null);
      await load();
      return 'found';
    }
    if (after >= needed && row) {
      // The shelf has them, but they're reserved for a replacement.
      reservedPrompt(row, needed, after);
      return 'reserved';
    }
    if (row) {
      marks.markOutOfStock(rowKey, row.quantity);
      marks.setMissingQty(rowKey, String(Math.min(row.quantity, needed - usable)));
    }
    setPrompt(null);
    await load();
    return 'os';
  };

  /** Leave the reserved pieces: the line is OS for what the free pieces don't cover. */
  const leaveReserved = () => {
    if (prompt?.kind !== 'reserved') return;
    const row = rows.find((r) => r.key === prompt.rowKey);
    if (row) {
      marks.markOutOfStock(row.key, row.quantity);
      marks.setMissingQty(row.key, String(Math.min(row.quantity, prompt.needed - prompt.free)));
    }
    setPrompt(null);
  };

  /** Owners only: give the reserved pieces to this order anyway (logged, the reserver is told). */
  const overrideReserved = async (reason: string) => {
    if (prompt?.kind !== 'reserved') return;
    await post({ productId: prompt.productId, reserveOverride: true, reason });
    setReleased((s) => new Set(s).add(prompt.productId));
    marks.markFound(prompt.rowKey);
    setPrompt(null);
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

  return { prompt, onFound, onOutOfStock, beforeBorrow, submitCount, notReceivedYet, confirmBothEmpty, leaveReserved, overrideReserved, closePrompt, reload: load };
}
