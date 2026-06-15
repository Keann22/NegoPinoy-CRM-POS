'use client';
import { useState, useEffect } from 'react';
import { useSupabase, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

export type StockBatch = {
  batchId: string;
  purchaseDate: string;
  originalQty: number;
  remainingQty: number;
  unitCost: number;
  supplierName: string;
};

export type ProductResult = { 
  id: string; 
  name: string; 
  quantityOnHand: number; 
  sellingPrice: number; 
  stockBatches: StockBatch[]; 
  [key: string]: any; 
};

export function useProductSearch() {
  const supabase = useSupabase();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<ProductResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const handler = setTimeout(async () => {
      if (searchTerm.length < 1) {
        setResults([]);
        return;
      }
      if (!supabase || !user) return;

      setIsSearching(true);
      const searchTermCapitalized = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1);

      try {
        let query = supabase.from('products').select('*');
        const searchWords = searchTerm.split(' ').filter(w => w.trim() !== '');
        searchWords.forEach(w => {
            query = query.or(`name.ilike.%${w}%,variant_name.ilike.%${w}%`);
        });
        const { data, error } = await query.limit(10);
        
        if (error) throw error;
        
        const mapped = (data || []).map(doc => ({
          id: doc.id, 
          ...doc,
          quantityOnHand: doc.stock_level,
          sellingPrice: doc.selling_price
        } as ProductResult));
        setResults(mapped);
      } catch (error) {
        console.error("Error searching products:", error);
        toast({ variant: "destructive", title: "Product search failed" });
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [searchTerm, supabase, user, toast]);

  const reset = () => {
    setSearchTerm('');
    setResults([]);
  };

  return { searchTerm, setSearchTerm, results, isSearching, reset };
}
