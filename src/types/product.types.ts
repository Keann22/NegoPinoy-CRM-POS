/**
 * product.types.ts
 * Centralized product-related type definitions.
 * All components and hooks must import product types from here.
 *
 * For form validation schemas, see /src/lib/schemas/product.ts
 */

export type Product = {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  categoryId?: string;
  categoryName?: string;
  sellingPrice: number;
  /** Master on-sale flag. When true the product shows a SALE badge (badge does not require a discount). */
  is_on_sale?: boolean | null;
  /** Optional sale price. When on sale AND below sellingPrice, this is charged as the cash price. */
  sale_price?: number | null;
  quantityOnHand: number;
  hasVariations?: boolean;
  images?: string[];
  createdAt?: string;
  updatedAt?: string;
  stockBatches?: StockBatch[];
  variations?: ProductVariation[];
  supplierPricing?: SupplierPricing[];
  // Supabase column aliases
  variant_name?: string;
  parent_id?: string;
  variantName?: string;
  installment_price?: number;
  assembly_recipe?: AssemblyRecipeItem[] | null;
  // Raw DB fields returned by Supabase selects
  supplier_pricing?: any;
  initial_unit_cost?: number;
  shelf_location?: string;
  stock_level?: number;
};

/** A single component entry in a bundle/assembly recipe. */
export type AssemblyRecipeItem = {
  productId: string;
  productName: string;
  quantity: number;
};

export type ProductVariation = {
  id: string;
  parentProductId: string;
  nameSuffix: string;
  sku?: string;
  sellingPrice: number;
  quantityOnHand: number;
  images?: string[];
};

export type StockBatch = {
  batchId: string;
  productId: string;
  purchaseDate: string;
  originalQty: number;
  remainingQty: number;
  unitCost: number;
  supplierName?: string;
  supplierId?: string;
  receiptUrl?: string;
};

export type SupplierPricing = {
  supplierId: string;
  supplierName: string;
  unitCost: number;
  supplierCode?: string;
};

export type Category = {
  id: string;
  name: string;
  description?: string;
};

export type InventoryMovement = {
  id: string;
  productId: string;
  productName: string;
  type: 'Restock' | 'Sale' | 'Return' | 'Adjustment' | 'Transfer';
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  referenceId?: string;
  notes?: string;
  createdAt: string;
  createdBy?: string;
};

export type StockStatus = {
  text: 'In Stock' | 'Low Stock' | 'Out of Stock';
  variant: 'outline' | 'default' | 'destructive';
};

/**
 * FormattedProduct — a Product enriched with display-ready fields.
 * Used by the products list page and product-dialog.
 * Previously defined inline in products/page.tsx — now canonical here.
 */
export type FormattedProduct = Product & {
  status: StockStatus;
  price: string;
  image: string;
  shelfLocation?: string;
  supplierPricing?: any[];
  children?: FormattedProduct[];
  parentName?: string;
  reservedStock?: number;
  packedStock?: number;
  installment_price?: number;
  assembly_recipe?: any[] | null;
  /** True when the product is flagged on sale (shows the SALE badge). */
  onSale?: boolean;
  /** Formatted regular price (e.g. "₱49.99"), set only when there's a real discount, shown struck-through. */
  regularPriceLabel?: string;
};

/**
 * Returns a stock status object for a given quantity.
 * Extracted from products/page.tsx — use this instead of re-implementing inline.
 */
export function getStockStatus(stock: number | undefined | null): StockStatus {
  const currentStock = stock ?? 0;
  if (currentStock <= 0) return { text: 'Out of Stock', variant: 'destructive' };
  if (currentStock <= 10) return { text: 'Low Stock', variant: 'default' };
  return { text: 'In Stock', variant: 'outline' };
}
