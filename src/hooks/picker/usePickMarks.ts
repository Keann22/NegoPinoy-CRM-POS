import { useState } from 'react';
import type { PickRow } from './types';

/**
 * What the picker said about each line: Found, or OS (with how many are
 * missing). Every line must be marked one way or the other before the pick can
 * be submitted, so an item can't be skipped and silently counted as found.
 */
export function usePickMarks() {
  const [outOfStockQty, setOutOfStockQty] = useState<Map<string, number>>(new Map());
  const [qtyDrafts, setQtyDrafts] = useState<Map<string, string>>(new Map());
  const [foundKeys, setFoundKeys] = useState<Set<string>>(new Set());

  const resetMarks = () => {
    setOutOfStockQty(new Map());
    setQtyDrafts(new Map());
    setFoundKeys(new Set());
  };

  /** Pre-marks lines that already have an open OS issue, so a re-pick doesn't drop them by accident. */
  const preloadOutOfStock = (qty: Map<string, number>) => {
    setOutOfStockQty(new Map(qty));
    setQtyDrafts(new Map(Array.from(qty.entries()).map(([k, v]) => [k, String(v)])));
    setFoundKeys(new Set());
  };

  const markFound = (rowKey: string) => {
    const nextQty = new Map(outOfStockQty);
    const nextDrafts = new Map(qtyDrafts);
    nextQty.delete(rowKey);
    nextDrafts.delete(rowKey);
    setOutOfStockQty(nextQty);
    setQtyDrafts(nextDrafts);
    setFoundKeys(new Set(foundKeys).add(rowKey));
  };

  const markOutOfStock = (rowKey: string, fullQty: number) => {
    const nextFound = new Set(foundKeys);
    nextFound.delete(rowKey);
    setFoundKeys(nextFound);
    if (outOfStockQty.has(rowKey)) return;
    setOutOfStockQty(new Map(outOfStockQty).set(rowKey, fullQty));
    setQtyDrafts(new Map(qtyDrafts).set(rowKey, String(fullQty)));
  };

  const handleQtyDraftChange = (rowKey: string, rawValue: string) => {
    setQtyDrafts(new Map(qtyDrafts).set(rowKey, rawValue));
    const parsed = parseInt(rawValue, 10);
    if (!isNaN(parsed) && parsed > 0) setOutOfStockQty(new Map(outOfStockQty).set(rowKey, parsed));
  };

  const commitOutOfStockQty = (rowKey: string, fullQty: number) => {
    const clamped = Math.min(Math.max(1, outOfStockQty.get(rowKey) || 1), fullQty);
    setOutOfStockQty(new Map(outOfStockQty).set(rowKey, clamped));
    setQtyDrafts(new Map(qtyDrafts).set(rowKey, String(clamped)));
  };

  /** Lines not yet marked Found or OS. */
  const unmarkedRows = (rows: PickRow[]) => rows.filter((r) => !foundKeys.has(r.key) && !outOfStockQty.has(r.key));

  return {
    outOfStockQty,
    qtyDrafts,
    foundKeys,
    resetMarks,
    preloadOutOfStock,
    markFound,
    markOutOfStock,
    handleQtyDraftChange,
    commitOutOfStockQty,
    unmarkedRows,
  };
}
