'use client';

import { useState, useEffect } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/lib/schemas/order';
import { getEffectivePrice, buildPriceList, selectWithPriceColumns } from '@/lib/pricing';

/**
 * useProductSearch
 * Debounced Supabase product search.
 * Extracted from order-dialog.tsx (lines 226–264).
 */
export function useProductSearch(query: string) {
  const supabase = useSupabase();
  const { user } = useUser();
  const { toast } = useToast();
  const [results, setResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const handler = setTimeout(async () => {
      if (query.length < 1) {
        setResults([]);
        return;
      }
      if (!supabase || !user) return;

      setIsSearching(true);
      try {
        const words = query.split(' ').filter(w => w.trim() !== '');
        const { data, error } = await selectWithPriceColumns((priceColumns) => {
          let q = supabase
            .from('products')
            .select(`id, name, variant_name, sku, stock_level, ${priceColumns}, parent_id, supplier_pricing`)
            .not('name', 'ilike', '[DELETED]%');
          words.forEach(w => { q = q.or(`name.ilike.%${w}%,variant_name.ilike.%${w}%,sku.ilike.%${w}%`); });
          return q.limit(20);
        });
        if (error) throw error;

        setResults((data || []).map(doc => {
          let displayName = doc.name;
          if (doc.variant_name && !doc.name.toLowerCase().includes(doc.variant_name.toLowerCase())) {
            displayName = `${doc.name} (${doc.variant_name})`;
          }
          return {
            id: doc.id,
            name: displayName,
            sku: doc.sku,
            quantityOnHand: doc.stock_level ?? 0,
            sellingPrice: getEffectivePrice(doc.selling_price, doc.sale_price, doc.is_on_sale) ?? 0,
            priceList: buildPriceList(doc),
            installment_price: doc.installment_price,
            supplier_pricing: doc.supplier_pricing,
            stockBatches: [],
          } as Product;
        }));
      } catch (err) {
        console.error('Product search failed:', err);
        toast({ variant: 'destructive', title: 'Product search failed' });
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [query, supabase, user, toast]);

  return { results, isSearching };
}
