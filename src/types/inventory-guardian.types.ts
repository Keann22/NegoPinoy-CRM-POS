/**
 * inventory-guardian.types.ts
 *
 * Types for the Agentic AI Physical Inventory Guardian and Monitoring System.
 */

export type InventoryAnomalyType =
  | 'unrecorded_purchase'   // stock_level < 0 with fulfilled orders (goods arrived & sold, unrecorded)
  | 'picker_shortage'       // picker reported out of stock on floor
  | 'uncosted_receipt'      // items received at 0 cost
  | 'borrowed_debt'         // items borrowed to fulfill an order needing replenishment
  | 'stale_reservation';    // orders holding stock for prolonged period

export interface InventoryAnomaly {
  id: string;
  productId: string;
  productName: string;
  sku?: string | null;
  currentStock: number;
  unfulfilledOrdersCount: number;
  unfulfilledQty: number;
  type: InventoryAnomalyType;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  recommendation: string;
  detectedAt: string;
  details?: {
    lastMovementDate?: string | null;
    shippedWithoutPurchaseQty?: number;
    pickerReportedQty?: number;
    reportedByName?: string | null;
    orderId?: string | null;
  };
  memoryContext?: {
    lastVerifiedCount?: number | null;
    lastVerifiedAt?: string | null;
    lastVerifiedBy?: string | null;
    expectedShelfCount?: number | null;
    repeatDiscrepancyCount?: number;
    hasMemoryConflict?: boolean;
  };
}

export interface InventoryGuardianMemoryEntry {
  id: string;
  productId: string;
  actionType: 'physical_count_audit' | 'purchase_backfill' | 'borrow_tagged' | 'anomaly_dismissed' | 'anomaly_notified';
  physicalCount?: number | null;
  systemStockBefore?: number | null;
  systemStockAfter?: number | null;
  discrepancy?: number | null;
  activeOrdersCount?: number | null;
  actorName?: string | null;
  notes?: string | null;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface PhysicalCountCorrectionPayload {
  productId: string;
  physicalShelfCount: number;
  notes?: string;
  actorName?: string;
  actorId?: string;
}

export interface BackfillPurchasePayload {
  productId: string;
  quantity: number;
  unitCost: number;
  supplierName?: string;
  purchaseDate?: string;
  actorName?: string;
  actorId?: string;
}

export interface BorrowStockPayload {
  productId: string;
  quantity: number;
  orderId?: string;
  notes?: string;
  actorName?: string;
  actorId?: string;
}

export interface CompletedDailyAuditItem {
  id: string;
  productId: string;
  productName: string;
  actorName: string;
  actionType: string;
  physicalCount?: number | null;
  systemStockBefore?: number | null;
  systemStockAfter?: number | null;
  discrepancy?: number | null;
  timestamp: string;
}

export interface GuardianDailyProgress {
  baseTarget: number;
  carryOver: number;
  target: number;
  completedToday: number;
  remainingToday: number;
  isGoalMet: boolean;
  isRestDay?: boolean;
  completedItems: CompletedDailyAuditItem[];
  totalBacklogCount: number;
  assignedStaffName?: string;
  teamCompletedToday?: number;
  allAuditedProductIdsToday?: string[];
  /** Shelf counts today (recorded purchases left out): the base for accuracy. */
  countedToday?: number;
  matchedToday?: number;
  accuracyRateToday?: number;
}

/** Single verified inventory count item with match/discrepancy details. */
export interface InventoryCountProgressItem {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  variantName?: string | null;
  physicalCount: number;
  systemStockBefore: number | null;
  systemStockAfter: number | null;
  /** Shelf (unallocated) number shown before the count; null on old rows without the numbers. */
  shelfBefore: number | null;
  /** Count minus shelfBefore (0 = matched the shelf). */
  discrepancy: number;
  actorName: string;
  actorId?: string | null;
  createdAt: string;
  notes?: string | null;
  actionType: string;
}

/** Aggregated daily counting accuracy metric for historical progress tracking. */
export interface InventoryCountDailyStat {
  date: string;
  totalCounted: number;
  matchedCount: number;
  diffCount: number;
  accuracyRate: number;
}

/** Breakdown of count accuracy by staff member. */
export interface StaffCountAccuracy {
  staffName: string;
  totalCounted: number;
  matchedCount: number;
  accuracyRate: number;
}

/** Full summary of inventory counting effort and progress. */
export interface InventoryCountProgressSummary {
  today: {
    date: string;
    totalCounted: number;
    matchedCount: number;
    discrepancyCount: number;
    accuracyRate: number;
  };
  staffBreakdown: StaffCountAccuracy[];
  recentItems: InventoryCountProgressItem[];
  history: InventoryCountDailyStat[];
}

/** Picker shelf guard: unallocated stock (both units) and Unit 2 reserve for one product. */
export interface PickerShelfInfo {
  unallocated: number;
  unit2: number;
}

/** Another open order that still needs a product (picker: give the pieces to the order they can finish). */
export interface WaitingOrder {
  orderId: string;
  customerName: string;
  need: number;
  status: string;
  createdAt: string;
}

/** An owner's request for Jas to count a product (sticky pop-up until counted). */
export interface RecountRequest {
  id: string;
  batchId: string;
  productId: string;
  productName: string;
  sku: string | null;
  message: string;
  requestedByName: string | null;
  createdAt: string;
}

/** A recount line on the Pabilang page: open, or already counted (Jas's own counts, never the system's). */
export interface RecountPageRow extends RecountRequest {
  status: 'open' | 'done';
  countedUnit1: number | null;
  countedUnit2: number | null;
  systemBefore?: number | null;
  doneByName: string | null;
  doneAt: string | null;
  dueDate: string | null;
}
