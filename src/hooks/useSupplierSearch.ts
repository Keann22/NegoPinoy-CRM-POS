'use client';
import { useState, useMemo } from 'react';
import { useSupabase, useCollection, useUser } from '@/firebase';

export type SupplierResult = { 
  id: string; 
  name: string; 
  [key: string]: any; 
};

/**
 * Extracts the supplier search logic from add-product-dialog.
 * Uses the useMemo + useCollection pattern (reactive query)
 * rather than a manual debounced fetch, matching how the original
 * component queries the suppliers table.
 */
export function useSupplierSearch() {
  const supabase = useSupabase();
  const { user } = useUser();
  
  const [searchTerm, setSearchTerm] = useState('');

  const suppliersQuery = useMemo(
    () => {
      if (!supabase || !user || searchTerm.length < 1) return null;
      const searchTermCapitalized = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1);
      return {
        path: 'suppliers',
        constraints: [
          { type: 'orderBy', field: 'name' },
          { type: 'where', field: 'name', op: '>=', value: searchTermCapitalized },
          { type: 'where', field: 'name', op: '<=', value: searchTermCapitalized + '\uf8ff' },
          { type: 'limit', value: 10 }
        ]
      };
    },
    [user, searchTerm]
  );

  const { data: results, isLoading: isSearching } = useCollection<SupplierResult>(suppliersQuery);

  const reset = () => {
    setSearchTerm('');
  };

  return { searchTerm, setSearchTerm, results: results || [], isSearching, reset };
}
