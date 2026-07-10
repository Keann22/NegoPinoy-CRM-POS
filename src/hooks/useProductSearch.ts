'use client';

import { useState, useEffect } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/lib/schemas/order';

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
        let q = supabase
          .from('products')
          .select('id, name, stock_level, selling_price, installment_price, parent_id, supplier_pricing')
          .not('name', 'ilike', '[DELETED]%');
        const words = query.split(' ').filter(w => w.trim() !== '');
        words.forEach(w => { q = q.or(`name.ilike.%${w}%,variant_name.ilike.%${w}%`); });
        const { data, error } = await q.gt('selling_price', 0).limit(15);
        if (error) throw error;

        setResults((data || []).map(doc => ({
          id: doc.id,
          name: doc.name,
          quantityOnHand: doc.stock_level,
          sellingPrice: doc.selling_price,
          installment_price: doc.installment_price,
          supplier_pricing: doc.supplier_pricing,
          stockBatches: [],
        } as Product)));
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
