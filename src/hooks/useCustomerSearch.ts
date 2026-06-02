'use client';
import { useState, useEffect } from 'react';
import { useSupabase, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

export type CustomerResult = { 
  id: string; 
  firstName: string; 
  lastName: string; 
  [key: string]: any; 
};

export function useCustomerSearch() {
  const supabase = useSupabase();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<CustomerResult[]>([]);
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
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .gte('full_name', searchTermCapitalized)
          .lt('full_name', searchTermCapitalized + '\uf8ff')
          .limit(10);
          
        if (error) throw error;
        
        const mapped = (data || []).map(doc => ({ 
          id: doc.id, 
          ...doc,
          firstName: doc.full_name?.split(' ')[0] || '',
          lastName: doc.full_name?.split(' ').slice(1).join(' ') || ''
        } as CustomerResult));
        setResults(mapped);
      } catch (error) {
        console.error("Error searching customers:", error);
        toast({ variant: "destructive", title: "Customer search failed" });
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
