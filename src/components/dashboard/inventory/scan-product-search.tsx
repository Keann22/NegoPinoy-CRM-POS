import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';

export type Product = { id: string; name: string; sku: string; [key: string]: any; };

export function ScanProductSearch({ rowIndex, form, onAddNewProduct }: { rowIndex: number; form: any; onAddNewProduct: (searchTerm: string, rowIndex: number) => void; }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState(form.getValues(`items.${rowIndex}.productName`) || '');

    const [productResults, setProductResults] = useState<Product[]>([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  
    const debouncedSearch = useCallback(() => {
        const handler = setTimeout(async () => {
            if (search.length < 2) {
              setProductResults([]);
              return;
            }
            
            setIsLoadingProducts(true);
            try {
              const supabase = createClient();
              let query = supabase.from('products').select('id, name, sku');
              const searchWords = search.split(' ').filter((w: string) => w.trim() !== '');
              searchWords.forEach((w: string) => {
                  query = query.or(`name.ilike.%${w}%,variant_name.ilike.%${w}%`);
              });
              const { data, error } = await query.limit(10);
              
              if (!error && data) {
                setProductResults(data as Product[]);
              } else {
                setProductResults([]);
              }
            } catch (error) {
              console.error("Error searching products:", error);
            } finally {
              setIsLoadingProducts(false);
            }
          }, 300);
      
          return () => clearTimeout(handler);
    }, [search]);


    useEffect(() => {
        if (!open) return;
        const cleanup = debouncedSearch();
        return cleanup;
      }, [search, open, debouncedSearch]);


    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start font-normal text-left">
                {form.watch(`items.${rowIndex}.productName`) || 'Search product...'}
            </Button>
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
                
                {!isLoadingProducts && productResults.length > 0 && (
                    <CommandGroup>
                    {productResults.map((p) => (
                        <CommandItem
                        key={p.id}
                        value={p.name.toLowerCase()}
                        onSelect={() => {
                            form.setValue(`items.${rowIndex}.productId`, p.id);
                            form.setValue(`items.${rowIndex}.productName`, p.name);
                            setOpen(false);
                        }}
                        >
                        {p.name}
                        </CommandItem>
                    ))}
                    </CommandGroup>
                )}
                
                {!isLoadingProducts && search.length > 1 && (
                    <>
                        {productResults.length > 0 && <CommandSeparator />}
                        <CommandItem
                            value={(search + ' add_new').toLowerCase()}
                            onSelect={() => {
                                onAddNewProduct(search, rowIndex);
                                setOpen(false);
                            }}
                            className="text-primary cursor-pointer"
                        >
                            + Add "{search}" as new product
                        </CommandItem>
                    </>
                )}

                <CommandEmpty>
                    {!isLoadingProducts && productResults.length === 0 && search.length < 2 
                        ? "Type to search products." 
                        : "No products found."
                    }
                </CommandEmpty>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
}
