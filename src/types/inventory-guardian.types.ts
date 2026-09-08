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
