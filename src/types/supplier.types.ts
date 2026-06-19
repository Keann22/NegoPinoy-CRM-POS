/**
 * supplier.types.ts
 * Centralized supplier-related type definitions.
 * All components and hooks must import supplier types from here.
 */

export type Supplier = {
  id: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ProcurementRequest = {
  id: string;
  productId: string;
  productName: string;
  supplierId?: string;
  supplierName?: string;
  requestedQty: number;
  status: 'Pending' | 'Approved' | 'Ordered' | 'Received' | 'Cancelled';
  requestedBy?: string;
  requestedAt: string;
  notes?: string;
};

export type ProcurementBatch = {
  id: string;
  supplierId?: string;
  supplierName?: string;
  items: ProcurementBatchItem[];
  status: 'Pending' | 'Received' | 'Partial';
  orderedAt?: string;
  receivedAt?: string;
  receiptUrl?: string;
  totalCost?: number;
};

export type ProcurementBatchItem = {
  productId: string;
  productName: string;
  orderedQty: number;
  receivedQty?: number;
  unitCost: number;
};
