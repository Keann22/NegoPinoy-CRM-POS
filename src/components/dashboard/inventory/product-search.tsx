import { useState, useEffect } from 'react';
import { useUser, useSupabase } from '@/lib/supabase/hooks';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

export type Product = { id: string; name: string; sku: string; [key: string]: any; };

export function ProductSearch({ onProductSelect }: { onProductSelect: (product: Product) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const supabase = useSupabase();
  const { user } = useUser();

  const [productResults, setProductResults] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  useEffect(() => {
    if (!supabase || !user || search.length < 2) {
      setProductResults([]);
      return;
    }
    const handler = setTimeout(async () => {
      setIsLoadingProducts(true);
      try {
        let query = supabase.from('products').select('*').not('name', 'ilike', '[DELETED]%');
        const searchWords = search.split(' ').filter(w => w.trim() !== '');
        searchWords.forEach(w => {
            query = query.or(`name.ilike.%${w}%,variant_name.ilike.%${w}%`);
        });
        const { data, error } = await query.order('name').limit(10);
        if (error) throw error;
        setProductResults(data || []);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsLoadingProducts(false);
      }
    }, 250);
    return () => clearTimeout(handler);
  }, [supabase, user, search]);
  
  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start font-normal text-left">Select Product...</Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search products..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoadingProducts && <CommandItem disabled>Searching...</CommandItem>}
            {productResults && productResults.length > 0 ? (
              <CommandGroup>
                {productResults.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.name.toLowerCase()}
                    onSelect={() => {
                      onProductSelect(p);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    {p.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              !isLoadingProducts && <CommandEmpty>No products found.</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
