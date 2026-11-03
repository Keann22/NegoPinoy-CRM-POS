export interface Product {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  category?: string;
  categoryName?: string;
  selling_price?: number | string | null;
  sale_price?: number | string | null;
  is_on_sale?: boolean | null;
  ads_price?: number | string | null;
  live_price?: number | string | null;
  installment_price?: number | string | null;
  images?: string[] | null;
  stock_level?: number | null;
  quantityOnHand?: number | null;
  created_at?: string;
}

export interface ProductGroup {
  baseName: string;
  baseProduct: Product;
  variations: Product[];
  minPrice: number;
  maxPrice: number;
  isOnSale: boolean;
  minSalePrice?: number;
  categories: string[];
}

export interface Testimonial {
  id: string;
  name: string;
  location: string;
  role: string;
  comment: string;
  rating: number;
  verifiedPurchase: boolean;
  avatarUrl?: string;
  productName?: string;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

export type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'name-asc' | 'sale-first';
