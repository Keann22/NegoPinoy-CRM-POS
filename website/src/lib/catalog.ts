import { supabase } from './supabase';
import { PUBLIC_PRODUCT_COLUMNS } from './publicProductColumns';

// The shop catalog, built from the products table.
// Sizes/colours are rows with parent_id pointing at their product; the parent row
// itself is just the title, photo and description (it often has price 0).

export interface RawProduct {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  sku: string | null;
  stock_level: number | null;
  images: string[] | null;
  selling_price: number | string | null;
  parent_id: string | null;
  variant_name: string | null;
  installment_price: number | string | null;
  is_on_sale: boolean | null;
  sale_price: number | string | null;
  ads_price: number | string | null;
  live_price: number | string | null;
  is_induction_ready: boolean | null;
  /** Chosen in the CRM for the top of the home page. */
  is_featured?: boolean | null;
}

export interface Variant {
  id: string;
  label: string;
  price: number;
  salePrice: number | null;
  inStock: boolean;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  description: string;
  images: string[];
  variants: Variant[];
  minPrice: number;
  maxPrice: number;
  sale: { price: number; was: number } | null;
  inStock: boolean;
  featured: boolean;
}

const PAGE_SIZE = 1000;

/** All product rows the public may read (the API returns at most 1000 per request). */
export async function fetchProducts(): Promise<RawProduct[]> {
  const rows: RawProduct[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('products')
      .select(PUBLIC_PRODUCT_COLUMNS)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as RawProduct[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const isHidden = (p: RawProduct) =>
  !p.name ||
  p.name.includes('[DELETED]') ||
  (p.category ?? '').trim() === 'Archived' ||
  p.name === 'Kaisa 22cm Multicooker';

// "Installment-Cash basis" and the like are payment options stored as sizes.
const isPaymentOption = (label: string) => /install|cash\s*basis/i.test(label);

/** A real category name, or '' for blanks and leftovers like "14". */
function cleanCategory(cat: string | null): string {
  const c = (cat ?? '').trim();
  if (!c || /^\d+$/.test(c) || c === 'Uncategorized') return '';
  return c;
}

function toVariant(p: RawProduct, parentName: string | null): Variant | null {
  const price = num(p.selling_price);
  if (price <= 0) return null;
  let label = (p.variant_name ?? '').trim();
  if (!label && parentName && p.name.startsWith(parentName)) {
    label = p.name.slice(parentName.length).replace(/^[\s\-–]+/, '').trim();
  }
  if (!label) label = p.name;
  if (isPaymentOption(label)) return null;
  const sale = num(p.sale_price);
  return {
    id: p.id,
    label,
    price,
    salePrice: p.is_on_sale && sale > 0 && sale < price ? sale : null,
    inStock: num(p.stock_level) > 0,
  };
}

export function buildCatalog(rows: RawProduct[]): CatalogItem[] {
  const live = rows.filter((p) => !isHidden(p));
  const children = new Map<string, RawProduct[]>();
  for (const p of live) {
    if (!p.parent_id) continue;
    const list = children.get(p.parent_id) ?? [];
    list.push(p);
    children.set(p.parent_id, list);
  }

  const items: CatalogItem[] = [];
  for (const p of live) {
    if (p.parent_id) continue; // listed under its parent
    const kids = children.get(p.id) ?? [];
    const variants = (kids.length ? kids.map((k) => toVariant(k, p.name)) : [toVariant(p, null)])
      .filter((v): v is Variant => v !== null)
      .sort((a, b) => a.price - b.price);
    if (!variants.length) continue;

    const images = (p.images?.length ? p.images : kids.find((k) => k.images?.length)?.images) ?? [];
    const prices = variants.map((v) => v.salePrice ?? v.price);
    const onSale = variants.filter((v) => v.salePrice !== null);
    const best = onSale.sort((a, b) => (a.salePrice as number) - (b.salePrice as number))[0];

    items.push({
      id: p.id,
      name: p.name.trim(),
      category: cleanCategory(p.category) || cleanCategory(kids.find((k) => cleanCategory(k.category))?.category ?? null),
      description: (p.description ?? kids.find((k) => k.description)?.description ?? '').trim(),
      images: images.filter(Boolean),
      variants,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      sale: best ? { price: best.salePrice as number, was: best.price } : null,
      inStock: variants.some((v) => v.inStock),
      featured: Boolean(p.is_featured),
    });
  }

  // In stock first, then ones with a photo, then by name.
  return items.sort(
    (a, b) =>
      Number(b.inStock) - Number(a.inStock) ||
      Number(b.images.length > 0) - Number(a.images.length > 0) ||
      a.name.localeCompare(b.name),
  );
}

// Short, familiar names for the category menu. Anything not listed shows as-is.
const CATEGORY_LABELS: Record<string, string> = {
  'Kitchen Utensils': 'Kusina',
  'Cooking Appliances': 'Appliances',
  'Home Appliances': 'Gamit sa Bahay',
  'Food Storage': 'Lalagyan',
  'Food Prep & Bakeware': 'Baking',
  'Home & Bedroom': 'Kwarto',
  'General Items': 'Iba pa',
  'Beauty & Personal Care': 'Beauty',
  'Lighting & Electronics': 'Ilaw at Electronics',
};

export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c;

/** Categories that have at least one product, biggest first; the catch-all goes last. */
export function categoriesOf(items: CatalogItem[]): string[] {
  const counts = new Map<string, number>();
  for (const it of items) if (it.category) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
  const last = (c: string) => Number(c === 'General Items');
  return [...counts.entries()].sort((a, b) => last(a[0]) - last(b[0]) || b[1] - a[1]).map(([c]) => c);
}

export function matchesSearch(item: CatalogItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.name.toLowerCase().includes(q) ||
    item.category.toLowerCase().includes(q) ||
    categoryLabel(item.category).toLowerCase().includes(q) ||
    item.variants.some((v) => v.label.toLowerCase().includes(q))
  );
}
