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

/**
 * Fetches every product row (including variant rows) for the printable count sheet.
 * Pages through in PAGE_SIZE chunks rather than one unfiltered select — an unfiltered
 * select silently caps at 1000 rows (see ARCHITECTURE.md, "The 1000-row query cap").
 */
export function useAllProductsForPrint() {
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
        const { data, error } = await supabase
          .from('products')
          .select('id, name, variant_name, sku, shelf_location, stock_level')
          .not('name', 'ilike', '[DELETED]%')
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
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { products, isLoading, refetch: fetchAll };
}
