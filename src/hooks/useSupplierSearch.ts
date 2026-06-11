'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSupabase, useUser } from '@/firebase';

export type SupplierResult = { 
  id: string; 
  name: string; 
  [key: string]: any; 
};

/**
 * Supplier search hook — migrated to direct Supabase debounced fetch.
 */
export function useSupplierSearch() {
  const supabase = useSupabase();
  const { user } = useUser();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SupplierResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!supabase || !user || searchTerm.length < 1) {
      setResults([]);
      return;
    }
    const handler = setTimeout(async () => {
      setIsSearching(true);
      try {
        const t = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1);
        const { data, error } = await supabase
          .from('suppliers')
          .select('id, name')
          .gte('name', t)
          .lte('name', t + '\uf8ff')
          .order('name')
          .limit(10);
        if (error) throw error;
        setResults(data || []);
      } catch (err) {
        console.error('Supplier search error:', err);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => clearTimeout(handler);
  }, [supabase, user, searchTerm]);

  const reset = useCallback(() => setSearchTerm(''), []);

  return { searchTerm, setSearchTerm, results, isSearching, reset };
}
