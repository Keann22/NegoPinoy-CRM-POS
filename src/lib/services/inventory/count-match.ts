import { unallocatedFromStockLevel } from './shelf-stock-service';

/** The stored numbers of one shelf count (inventory_guardian_memory, physical_count_audit). */
export interface StoredShelfCount {
  physical_count?: number | null;
  system_stock_before?: number | null;
  system_stock_after?: number | null;
  discrepancy?: number | null;
}

export interface ShelfCountResult {
  /** The shelf (unallocated) number the system showed before the count. */
  shelfBefore: number | null;
  /** Count minus that shelf number. 0 = the count matched the shelf. */
  shelfDiff: number;
  isMatch: boolean;
}

/**
 * Scores a count against the shelf number staff saw, not against stock_level.
 *
 * Every count writer saves after = count − unpicked, so unpicked = count − after
 * and the shelf before = max(0, before + unpicked) (LOCKED formula). When
 * stock_level is below zero the shelf shows 0, and a count of 0 is a match even
 * though stock_level changed (found 2026-11-09: 54 such counts scored as "+N").
 */
export function scoreShelfCount(row: StoredShelfCount): ShelfCountResult {
  const count = row.physical_count;
  const before = row.system_stock_before;
  const after = row.system_stock_after;
  if (count == null || before == null || after == null) {
    const diff = row.discrepancy ?? 0;
    return { shelfBefore: null, shelfDiff: diff, isMatch: diff === 0 };
  }
  const unpicked = count - after;
  const shelfBefore = unallocatedFromStockLevel(before, unpicked);
  const shelfDiff = count - shelfBefore;
  return { shelfBefore, shelfDiff, isMatch: shelfDiff === 0 };
}
