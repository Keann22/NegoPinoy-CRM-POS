import { useState, useEffect, useRef } from 'react';
import { useUser, useSupabase } from '@/lib/supabase/hooks';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

export type OrderResult = { id: string; status: string; customers?: { full_name: string } | null; [key: string]: any; };

// orders.id is a uuid column, and this Supabase project's PostgREST doesn't support
// the `column::type` cast-in-filter syntax needed for `ilike` on a uuid column, so
// matching is done client-side against a cached batch of recent orders instead.
export function OrderSearch({ onOrderSelect }: { onOrderSelect: (order: OrderResult) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const supabase = useSupabase();
  const { user } = useUser();

  const [allOrders, setAllOrders] = useState<OrderResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!open || !supabase || !user || hasFetched.current) return;
    hasFetched.current = true;

    (async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('id, status, customer_id, customers(full_name)')
          .order('created_at', { ascending: false })
          .limit(500);
        if (error) throw error;
        setAllOrders((data as any) || []);
      } catch (err) {
        console.error('Order search error:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [open, supabase, user]);

  const normalizedSearch = search.trim().toLowerCase().replace(/-/g, '');
  const orderResults = normalizedSearch.length < 2
    ? []
    : allOrders.filter(o =>
        o.id.replace(/-/g, '').toLowerCase().startsWith(normalizedSearch) ||
        (o.customers?.full_name || '').toLowerCase().includes(normalizedSearch)
      ).slice(0, 10);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start font-normal text-left">Select Order...</Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type order number or customer name..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading && <CommandItem disabled>Loading orders...</CommandItem>}
            {!isLoading && orderResults.length > 0 ? (
              <CommandGroup>
                {orderResults.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={o.id}
                    onSelect={() => {
                      onOrderSelect(o);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    Order #{o.id.substring(0, 7).toUpperCase()} — {o.customers?.full_name || 'Unknown Customer'}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              !isLoading && normalizedSearch.length >= 2 && <CommandEmpty>No orders found.</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
