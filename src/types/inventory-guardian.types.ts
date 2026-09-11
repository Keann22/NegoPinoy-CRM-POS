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
}

export interface BackfillPurchasePayload {
  productId: string;
  quantity: number;
  unitCost: number;
  supplierName?: string;
  purchaseDate?: string;
  actorName?: string;
}

export interface BorrowStockPayload {
  productId: string;
  quantity: number;
  orderId?: string;
  notes?: string;
  actorName?: string;
}

export interface CompletedDailyAuditItem {
  id: string;
  productId: string;
  productName: string;
  actorName: string;
  actionType: string;
  physicalCount?: number | null;
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
}


