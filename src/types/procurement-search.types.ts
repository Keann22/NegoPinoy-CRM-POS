export interface OnlineOrderItem {
  id: string;
  productId: string;
  productName: string;
  variantName?: string | null;
  expectedQty: number;
  receivedQty: number;
  unitCost: number;
  supplierName?: string | null;
  supplierCode?: string | null;
}

export interface OnlineOrderSearchResult {
  id: string;
  createdAt: string;
  status: 'pending_receipt' | 'received';
  trackingRoute: string | null;
  trackingStage: string | null;
  platformOrderNo: string | null;
  trackingNo: string | null;
  expectedArrival: string | null;
  platform: 'Pinduoduo' | 'Shopee' | 'Other';
  supplierName?: string | null;
  items: OnlineOrderItem[];
}
