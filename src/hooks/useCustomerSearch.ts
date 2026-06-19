'use client';

import { useState, useEffect } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import type { Customer } from '@/lib/schemas/order';

/**
 * useCustomerSearch
 * Debounced Supabase customer search.
 * Extracted from order-dialog.tsx (lines 185–221).
 */
export function useCustomerSearch(query: string) {
  const supabase = useSupabase();
  const { user } = useUser();
  const { toast } = useToast();
  const [results, setResults] = useState<Customer[]>([]);
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
        let q = supabase.from('customers').select('*');
        const words = query.split(' ').filter(w => w.trim() !== '');
        words.forEach(w => { q = q.ilike('full_name', `%${w}%`); });
        const { data, error } = await q.limit(10);
        if (error) throw error;

        setResults((data || []).map(doc => ({
          id: doc.id,
          ...doc,
          firstName: doc.full_name?.split(' ')[0] || '',
          lastName: doc.full_name?.split(' ').slice(1).join(' ') || '',
        } as Customer)));
      } catch (err) {
        console.error('Customer search failed:', err);
        toast({ variant: 'destructive', title: 'Customer search failed' });
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [query, supabase, user, toast]);

  return { results, isSearching };
}
