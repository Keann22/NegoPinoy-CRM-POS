"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2, Plus } from "lucide-react";
import { useSupabase, useUser } from "@/lib/supabase/hooks";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Product = { id: string; name: string; variant_name?: string };

export default function ProcurementRequestPage() {
  const [items, setItems] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = useSupabase();
  const { user } = useUser();
  const { isManagement } = useRoleCheck();

  const [openSearch, setOpenSearch] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  useEffect(() => {
    if (!supabase || !user || productSearch.length < 2) {
      setProductResults([]);
      return;
    }
    const handler = setTimeout(async () => {
      setIsLoadingProducts(true);
      try {
        let query = supabase.from('products').select('id, name, variant_name');
        const searchWords = productSearch.split(' ').filter(w => w.trim() !== '');
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
  }, [supabase, user, productSearch]);

  const handleProductSelect = (product: Product) => {
    if (items.find(i => i.productId === product.id)) {
      alert("Product is already in the list!");
      return;
    }

    const displayName = `${product.name} ${product.variant_name ? `[${product.variant_name}]` : ''}`;
    setItems([...items, { productId: product.id, productName: displayName, requestedQty: "1" }]);
    setOpenSearch(false);
    setProductSearch('');
  };

  const handleQtyChange = (productId: string, newQty: string) => {
    setItems(items.map(i => i.productId === productId ? { ...i, requestedQty: newQty } : i));
  };

  const handleRemove = (productId: string) => {
    setItems(items.filter(i => i.productId !== productId));
  };

  const handleSubmit = async () => {
    const validRequests = items
      .filter(i => i.requestedQty && Number(i.requestedQty) > 0)
      .map(i => ({
        productId: i.productId,
        requestedQty: Number(i.requestedQty)
      }));

    if (validRequests.length === 0) {
      return alert("Please add at least one product with a valid quantity.");
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inventory/procurement-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: validRequests })
      });

      if (!res.ok) throw new Error(await res.text());

      alert("Procurement request successfully submitted to Management!");
      setItems([]);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6 bg-white shadow rounded-lg mt-8">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Procurement Request</h1>
          <p className="text-slate-600">Select products and submit a request to Management for buying.</p>
        </div>
        <Button onClick={handleSubmit} disabled={isSubmitting || items.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-2">
          {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : "Submit Request"}
        </Button>
      </div>

      <div className="bg-slate-50 p-4 rounded-lg border flex items-center justify-between">
          <p className="text-sm text-slate-600 font-medium">Add products to your procurement request list</p>
          <Popover open={openSearch} onOpenChange={setOpenSearch}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="shrink-0">
                <Plus className="mr-2 h-4 w-4" />
                Add Product to Procure
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-80" align="end">
              <Command shouldFilter={false}>
                <CommandInput 
                  placeholder="Search products..." 
                  value={productSearch}
                  onValueChange={setProductSearch}
                />
                <CommandList>
                  {isLoadingProducts && <CommandItem disabled value="searching">Searching...</CommandItem>}
                  {productSearch.length > 1 && !isLoadingProducts && productResults.length === 0 && (
                    <CommandEmpty>No products found.</CommandEmpty>
                  )}
                  {productResults.length > 0 && (
                    <CommandGroup>
                      {productResults.map((p) => (
                        <CommandItem key={p.id} value={`${p.name} ${p.variant_name || ''} ${p.id}`} onSelect={() => handleProductSelect(p)}>
                          {p.name} {p.variant_name ? `[${p.variant_name}]` : ''}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
      </div>

      {items.length === 0 ? (
        <div className="p-12 text-center border rounded-lg border-dashed text-slate-400">
          <p className="text-lg font-medium">Your request list is empty</p>
          <p className="text-sm">Click the "Add Product" button above to start building your request.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-700 border-b">
              <tr>
                <th className="p-4">Product Name</th>
                <th className="p-4 w-1/4 text-center">Qty to Request</th>
                <th className="p-4 w-16 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-700">
              {items.map(item => (
                <tr key={item.productId} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-medium text-slate-900">{item.productName}</td>
                  <td className="p-4">
                    <div className="flex items-center justify-center">
                      <Input 
                        type="number" 
                        min="1"
                        className="w-24 text-center text-lg font-bold border-blue-200 focus-visible:ring-blue-500" 
                        value={item.requestedQty}
                        onChange={(e) => handleQtyChange(item.productId, e.target.value)}
                      />
                    </div>
                  </td>
                  <td className="p-4 text-center">
                      <Button variant="ghost" size="icon" onClick={() => handleRemove(item.productId)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                      </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
