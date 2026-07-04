"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Search, PlusCircle } from "lucide-react";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export function AddMissingItemDialog({
  open,
  onOpenChange,
  groupedItems,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupedItems: any[];
  onSuccess: () => void;
}) {
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);

  useEffect(() => {
    if (productSearch.length < 2) {
      setProductResults([]);
      return;
    }
    const search = async () => {
      setIsSearchingProducts(true);
      try {
        const searchWords = productSearch.split(' ').filter(w => w.trim() !== '');
        let query = supabase.from('products').select('*');
        searchWords.forEach(word => {
          query = query.ilike('name', `%${word}%`);
        });
        const { data } = await query.limit(10);
        setProductResults(data || []);
      } finally {
        setIsSearchingProducts(false);
      }
    };
    const to = setTimeout(search, 300);
    return () => clearTimeout(to);
  }, [productSearch]);

  const handleAddAdhocProduct = async (product: any) => {
    // Check if it's already in the list
    for (const group of groupedItems) {
      if (group.items.some((i: any) => i.productId === product.id)) {
        alert("This item is already in the list!");
        onOpenChange(false);
        setProductSearch("");
        return;
      }
    }

    try {
      setIsSearchingProducts(true);
      const res = await fetch('/api/inventory/procurement-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ productId: product.id, requestedQty: 1 }]
        })
      });
      if (!res.ok) throw new Error(await res.text());
      
      onOpenChange(false);
      setProductSearch("");
      onSuccess();
    } catch (e: any) {
      alert("Failed to add product: " + e.message);
    } finally {
      setIsSearchingProducts(false);
    }
  };

  // Reset search when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setProductSearch("");
      setProductResults([]);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Missing Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search products to add..."
              className="w-full border rounded-md pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
          </div>
          
          <div className="max-h-[300px] overflow-y-auto space-y-2">
            {isSearchingProducts ? (
              <div className="text-center text-sm text-slate-500 py-4">Searching...</div>
            ) : productSearch.length > 0 && productResults.length === 0 ? (
              <div className="text-center text-sm text-slate-500 py-4">No products found</div>
            ) : (
              productResults.map((product) => (
                <button
                  key={product.id}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 rounded-lg border text-sm flex justify-between items-center group transition-colors"
                  onClick={() => handleAddAdhocProduct(product)}
                >
                  <div>
                    <div className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {product.name} {product.variant_name ? `[${product.variant_name}]` : ''}
                    </div>
                    <div className="text-slate-500 text-xs mt-1">
                      Stock: {product.stock_level} | Cost: ₱{product.initial_unit_cost}
                    </div>
                  </div>
                  <PlusCircle className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                </button>
              ))
            )}
          </div>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
