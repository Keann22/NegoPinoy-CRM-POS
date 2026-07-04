'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';

export interface PrintableProduct {
  id: string;
  name: string;
  variant_name: string | null;
  sku: string | null;
  shelf_location: string | null;
  stock_level: number | null;
}

const PAGE_SIZE = 1000;

/** Matches the "Low Stock" threshold already used by getStockStatus() in product.types.ts. */
const LOW_STOCK_THRESHOLD = 10;

export type PrintStockFilter = 'all' | 'low-or-negative' | 'negative';

/**
 * Fetches product rows for the printable count sheet, optionally scoped to low/negative
 * stock so the sheet (and the print job itself) stays a manageable size instead of every
 * product in the catalog. Pages through in PAGE_SIZE chunks rather than one unfiltered
 * select — an unfiltered select silently caps at 1000 rows (see ARCHITECTURE.md, "The
 * 1000-row query cap").
 *
 * "low-or-negative" deliberately excludes exactly-zero stock: in this catalog the vast
 * majority of products sit at 0 (buy-to-order model), so including zero would barely
 * shrink the list at all (984 of 1006 rows) — it wouldn't fix the print job being too
 * large. Excluding zero brings it down to the products that actually have something to
 * physically verify or a stock discrepancy to investigate (~419 of 1006).
 */
export function useAllProductsForPrint(stockFilter: PrintStockFilter = 'all') {
  const supabase = useSupabase();
  const [products, setProducts] = useState<PrintableProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!supabase) return;
    setIsLoading(true);
    try {
      let all: PrintableProduct[] = [];
      let page = 0;
      while (true) {
        let query = supabase
          .from('products')
          .select('id, name, variant_name, sku, shelf_location, stock_level')
          .not('name', 'ilike', '[DELETED]%');

        if (stockFilter === 'low-or-negative') {
          query = query.lte('stock_level', LOW_STOCK_THRESHOLD).neq('stock_level', 0);
        } else if (stockFilter === 'negative') {
          query = query.lt('stock_level', 0);
        }

        const { data, error } = await query
          .order('name', { ascending: true })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (error) throw error;
        all = all.concat(data || []);
        if (!data || data.length < PAGE_SIZE) break;
        page++;
      }
      setProducts(all);
    } catch (err) {
      console.error('Error fetching products for print:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, stockFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { products, isLoading, refetch: fetchAll };
}
