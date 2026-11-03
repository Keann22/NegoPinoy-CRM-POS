// Product columns the public (anon) key may read. The database only grants these,
// so `select('*')` on products fails for website visitors. Never add cost, supplier,
// shelf or recipe columns here: they are owner-only.
// (One string literal so supabase-js can type the result.)
export const PUBLIC_PRODUCT_COLUMNS =
  'id, name, category, description, sku, stock_level, images, selling_price, parent_id, variant_name, installment_price, is_on_sale, sale_price, ads_price, live_price, is_induction_ready, is_featured' as const;
