export type PurchaseRow = {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  receivedQty: number;
  unitCost: number;
  totalCost: number;
  supplierId: string | null;
  supplierName: string | null;
  status: string;
  batchName: string | null;
  purchasedAt: string;
};

// Stock that arrived but was never costed — see the notes in
// /api/reports/purchases. These are invisible to the report proper because they
// have no supplier and no price, so they get their own banner.
export type UnrecordedRow = {
  id: string;
  productName: string;
  expectedQty: number;
  receivedQty: number;
  unitCost: number;
  missingSupplier: boolean;
  missingCost: boolean;
  requestedByName: string | null;
  source: string;
  suggestedSupplierId: string | null;
  suggestedUnitCost: number | null;
  costSource: string | null;
  costSourceDate: string | null;
  costConflict: { bookCost: number; lastPurchaseCost: number } | null;
  receivedAt: string | null;
};

export type SupplierOption = { id: string; name: string };

export type ProductSaleStat = {
  productId: string;
  name: string;
  qty: number;
  revenue: number;
  ordersCount: number;
  avgPrice: number;
  percentageOfTotalRevenue: number;
};

export type ProductSalesSummary = {
  totalUnits: number;
  totalRevenue: number;
  distinctProducts: number;
  topProduct: string | null;
};

