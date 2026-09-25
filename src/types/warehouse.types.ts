/**
 * warehouse.types.ts
 * Centralized type definitions for multi-warehouse tracking.
 * Used for Unit 1 (Fulfillment Hub) and Unit 2 (Reserve & Inbound).
 */

export interface Warehouse {
  id: string;
  code: 'UNIT1' | 'UNIT2' | string;
  name: string;
  is_fulfillment_hub: boolean;
  is_active: boolean;
  created_at?: string;
}

export interface ProductWarehouseStock {
  id: string;
  product_id: string;
  warehouse_id: string;
  stock_level: number;
  shelf_location?: string | null;
  reorder_threshold: number;
  updated_at?: string;
  warehouse?: Warehouse;
}

export interface StockTransfer {
  id: string;
  transfer_number: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: 'completed' | 'cancelled';
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  from_warehouse?: Warehouse;
  to_warehouse?: Warehouse;
  items?: StockTransferItem[];
}

export interface StockTransferItem {
  id: string;
  transfer_id: string;
  product_id: string;
  quantity: number;
  created_at?: string;
  product_name?: string;
  product_sku?: string;
}

export interface ReplenishmentSuggestion {
  productId: string;
  productName: string;
  sku?: string;
  unit1Stock: number;
  unit2Stock: number;
  unit1Shelf?: string | null;
  unit2Shelf?: string | null;
  reorderThreshold: number;
  suggestedTransferQty: number;
}
