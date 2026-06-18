"use client";

import { useState, useEffect, Fragment } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useSupabase } from "@/lib/supabase/hooks";
import { useToast } from "@/hooks/use-toast";

function ProductSearch({ onProductSelect }: { onProductSelect: (product: any) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const supabase = useSupabase();
  const [productResults, setProductResults] = useState<any[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  useEffect(() => {
    if (!supabase || search.length < 2) {
      setProductResults([]);
      return;
    }
    const handler = setTimeout(async () => {
      setIsLoadingProducts(true);
      try {
        let query = supabase.from('products').select('id, name, stock_level, variant_name');
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
  }, [supabase, search]);
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start font-normal text-left">
          <Plus className="mr-2 h-4 w-4" /> Add Unexpected Item
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
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
                    value={p.name}
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

export function PendingPurchases({ onReceiveComplete }: { onReceiveComplete: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [unexpectedItems, setUnexpectedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchPending = async () => {
    try {
      const res = await fetch("/api/inventory/receive/pending-pos");
      const data = await res.json();
      setItems(data.pendingItems || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleQtyChange = (id: string, qty: string) => {
    setItems(items.map(i => i.id === id ? { ...i, receivedQty: qty } : i));
  };

  const handleReasonChange = (id: string, reason: string) => {
    setItems(items.map(i => i.id === id ? { ...i, discrepancyReason: reason } : i));
  };

  const handleReceiveSingle = async (item: any, isUnexpected: boolean = false) => {
    let toReceive = [];
    let toReceiveUnexpected = [];

    if (isUnexpected) {
        if (!item.receivedQty || Number(item.receivedQty) <= 0) {
            return toast({ variant: 'destructive', title: 'Invalid Quantity', description: 'Please enter a valid received quantity.' });
        }
        toReceiveUnexpected.push({
            productId: item.id,
            receivedQty: Number(item.receivedQty),
            unitCost: item.sellingPrice ? item.sellingPrice * 0.8 : 0
        });
    } else {
        if (!item.receivedQty || Number(item.receivedQty) <= 0) {
            return toast({ variant: 'destructive', title: 'Invalid Quantity', description: 'Please enter a valid received quantity.' });
        }
        if (Number(item.receivedQty) < Number(item.remainingQty) && (!item.discrepancyReason || item.discrepancyReason.trim() === '')) {
            return toast({ variant: 'destructive', title: 'Reason Required', description: `Please provide a discrepancy reason for: ${item.productName}` });
        }
        toReceive.push({
            itemId: item.id,
            receivedQty: Number(item.receivedQty),
            discrepancyReason: Number(item.receivedQty) < Number(item.remainingQty) ? item.discrepancyReason : undefined
        });
    }

    setSubmittingId(item.id);
    try {
      const res = await fetch("/api/inventory/receive/pending-pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receives: toReceive, unexpectedItems: toReceiveUnexpected })
      });

      if (!res.ok) throw new Error(await res.text());

      toast({ title: 'Item Saved!', description: `Successfully received ${item.productName || item.name}.` });
      
      if (isUnexpected) {
          setUnexpectedItems(unexpectedItems.filter(i => i.id !== item.id));
      } else {
          fetchPending();
      }
      onReceiveComplete();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setSubmittingId(null);
    }
  };

  const handleReceive = async () => {
    // filter out items that have receivedQty entered
    const toReceive = items.filter(i => i.receivedQty && Number(i.receivedQty) > 0).map(i => ({
      itemId: i.id,
      receivedQty: Number(i.receivedQty),
      discrepancyReason: Number(i.receivedQty) < Number(i.remainingQty) ? i.discrepancyReason : undefined
    }));

    const toReceiveUnexpected = unexpectedItems.filter(i => i.receivedQty && Number(i.receivedQty) > 0).map(i => ({
      productId: i.id,
      receivedQty: Number(i.receivedQty),
      unitCost: i.sellingPrice ? i.sellingPrice * 0.8 : 0 // Default approximation if needed, normally we ask for cost
    }));

    // Validation
    const invalidDiscrepancies = items.filter(i => i.receivedQty && Number(i.receivedQty) > 0 && Number(i.receivedQty) < Number(i.remainingQty) && (!i.discrepancyReason || i.discrepancyReason.trim() === ''));
    if (invalidDiscrepancies.length > 0) {
        return toast({ variant: 'destructive', title: 'Reason Required', description: `Please provide a discrepancy reason for: ${invalidDiscrepancies.map(i => i.productName).join(', ')}` });
    }

    if (toReceive.length === 0 && toReceiveUnexpected.length === 0) {
      return toast({ variant: 'destructive', title: 'No Items', description: "Please enter the received quantity for at least one item." });
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inventory/receive/pending-pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receives: toReceive, unexpectedItems: toReceiveUnexpected })
      });

      if (!res.ok) throw new Error(await res.text());

      toast({ title: 'Success', description: "Successfully received purchases!" });
      setUnexpectedItems([]);
      fetchPending();
      onReceiveComplete();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div>Loading pending purchases...</div>;
  if (items.length === 0 && unexpectedItems.length === 0) {
      // If nothing pending, just show the Add Unexpected Item wrapper
      return (
          <div className="mb-6 flex justify-end">
              <ProductSearch onProductSelect={(p) => {
                  if (!unexpectedItems.find(x => x.id === p.id)) {
                      setUnexpectedItems([...unexpectedItems, { ...p, receivedQty: '' }]);
                  }
              }} />
          </div>
      );
  }

  return (
    <Card className="mb-6 border-indigo-200 shadow-md">
      <CardHeader className="bg-indigo-50/50 pb-4 border-b">
        <CardTitle className="text-xl text-indigo-900">Pending Incoming Items</CardTitle>
        <CardDescription>Items recently purchased by Management or requested by Staff that are waiting to be received into inventory.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 border-b">
            <tr>
              <th className="p-4 w-1/2">Product Name</th>
              <th className="p-4 w-1/4 text-center">Expected Qty</th>
              <th className="p-4 w-1/4">Received Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y text-slate-700">
            {Object.entries(
                items.reduce((acc, item) => {
                    const batch = item.batchName || 'Unknown Batch';
                    if (!acc[batch]) acc[batch] = [];
                    acc[batch].push(item);
                    return acc;
                }, {} as Record<string, any[]>)
            ).map(([batchName, batchItems]: [string, any]) => (
                <Fragment key={batchName}>
                    <tr className="bg-slate-100">
                        <td colSpan={3} className="p-2">
                            <div className="flex justify-between items-center w-full">
                                <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                                    {batchName.replace(/_/g, ' ')}
                                </span>
                                {batchName.startsWith('BATCH_') && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs bg-white text-slate-600 hover:bg-red-50 hover:text-red-700"
                                        onClick={async () => {
                                            if (!confirm(`Are you sure you want to close ${batchName.replace(/_/g, ' ')}? Any unbought items will roll over to pending requests.`)) return;
                                            try {
                                                const res = await fetch('/api/inventory/procurement-batch/close', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ batchName })
                                                });
                                                if (!res.ok) throw new Error(await res.text());
                                                toast({ title: 'Batch Closed', description: `Unbought items rolled over.` });
                                                fetchPending();
                                            } catch (e: any) {
                                                toast({ variant: 'destructive', title: 'Error', description: e.message });
                                            }
                                        }}
                                    >
                                        Close Batch & Rollover
                                    </Button>
                                )}
                            </div>
                        </td>
                    </tr>
                    {batchItems.map((item: any) => {
                      const isDiscrepancy = item.receivedQty && Number(item.receivedQty) > 0 && Number(item.receivedQty) < Number(item.remainingQty);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="p-4 font-medium text-slate-900">
                              {item.productName}
                              {isDiscrepancy && (
                                  <div className="mt-2">
                                      <Input 
                                        placeholder="Why is there a discrepancy? (e.g. Missing 2 items)"
                                        value={item.discrepancyReason || ''}
                                        onChange={(e) => handleReasonChange(item.id, e.target.value)}
                                        className="border-red-200 focus-visible:ring-red-500 bg-red-50 text-xs h-8"
                                      />
                                  </div>
                              )}
                          </td>
                          <td className="p-4 text-center font-bold text-slate-600">
                              {item.remainingQty}
                              {item.alreadyReceivedQty > 0 && (
                                  <div className="text-xs font-normal text-slate-400 mt-1">({item.alreadyReceivedQty} prev. received)</div>
                              )}
                          </td>
                          <td className="p-4 flex items-center gap-2">
                            <Input 
                              type="number" 
                              placeholder={`Matches ${item.remainingQty}?`}
                              value={item.receivedQty || ''}
                              onChange={(e) => handleQtyChange(item.id, e.target.value)}
                              className={isDiscrepancy ? "border-red-300" : "border-indigo-200 focus-visible:ring-indigo-500"}
                            />
                            <Button 
                                type="button" 
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
                                onClick={() => handleReceiveSingle(item, false)}
                                disabled={submittingId === item.id}
                            >
                                {submittingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                </Fragment>
            ))}

            {/* Unexpected Items */}
            {unexpectedItems.length > 0 && (
                <tr className="bg-amber-50/50">
                    <td colSpan={3} className="p-2 text-xs font-semibold text-amber-800 uppercase tracking-wider bg-amber-100/50">
                        Unexpected Items (Not in Purchase Order)
                    </td>
                </tr>
            )}
            {unexpectedItems.map(item => (
                <tr key={`unexpected-${item.id}`} className="hover:bg-amber-50">
                  <td className="p-4 font-medium text-slate-900">
                      {item.name}
                      <div className="text-xs text-amber-600 mt-1">Added manually to delivery</div>
                  </td>
                  <td className="p-4 text-center font-bold text-slate-400">-</td>
                  <td className="p-4 flex gap-2">
                    <Input 
                      type="number" 
                      placeholder={`Qty`}
                      value={item.receivedQty || ''}
                      onChange={(e) => {
                          setUnexpectedItems(unexpectedItems.map(i => i.id === item.id ? { ...i, receivedQty: e.target.value } : i));
                      }}
                      className="border-amber-200 focus-visible:ring-amber-500"
                    />
                    <Button 
                        type="button" 
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
                        onClick={() => handleReceiveSingle(item, true)}
                        disabled={submittingId === item.id}
                    >
                        {submittingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setUnexpectedItems(unexpectedItems.filter(i => i.id !== item.id))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
        
        <div className="p-4 border-t flex justify-between bg-slate-50 items-center">
          <div className="w-[250px]">
              <ProductSearch onProductSelect={(p) => {
                  if (!unexpectedItems.find(x => x.id === p.id)) {
                      setUnexpectedItems([...unexpectedItems, { ...p, receivedQty: '' }]);
                  }
              }} />
          </div>
          <Button onClick={handleReceive} disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Receive Checked Items
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
