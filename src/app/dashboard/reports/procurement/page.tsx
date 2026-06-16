"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { ViewProductDetailsDialog } from "@/components/dashboard/view-product-details-dialog";
import { Copy, PlusCircle, Search, Trash2, Flag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function ProcurementSheet() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [groupedItems, setGroupedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // State to hold user input for purchases
  const [purchases, setPurchases] = useState<Record<string, {qty: string, cost: string, supplierId: string}>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean | string>(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [pendingSupplier, setPendingSupplier] = useState<Record<string, string>>({});

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);

  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issueProduct, setIssueProduct] = useState<any>(null);
  const [issueNote, setIssueNote] = useState("");
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/inventory/procurement?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      setSuppliers(data.suppliers || []);
      setGroupedItems(data.groupedOutofStock || []);
      
      const initialPurchases: Record<string, any> = {};
      (data.groupedOutofStock || []).forEach((group: any) => {
        group.items.forEach((item: any) => {
          initialPurchases[item.productId] = {
            qty: "", // Must be manually entered to prevent accidental submission
            cost: item.unitCost || '',
            supplierId: item.supplierId || '',
            draftItemId: item.draftItemId || null
          };
        });
      });
      setPurchases(initialPurchases);
    } catch (e: any) {
      console.error(e);
      alert("Failed to load procurement data: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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

  const handleUpdatePurchase = (productId: string, field: string, value: string) => {
    setPurchases(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value
      }
    }));
  };

  const handleProductClick = async (productId: string) => {
    setIsLoadingProduct(true);
    try {
      const { data, error } = await supabase.from('products').select('*').eq('id', productId).single();
      if (error) throw error;
      
      let sp = data.supplier_pricing || [];
      if (sp.length === 0 && data.initial_unit_cost) {
          sp = [{ supplierName: 'Initial Stock', unitCost: data.initial_unit_cost }];
      }

      const formatted = {
        ...data,
        quantityOnHand: data.stock_level ?? 0,
        status: { variant: 'default', text: 'Active' },
        price: `₱${(Number(data.selling_price) || 0).toFixed(2)}`,
        image: data.images?.[0] || 'https://placehold.co/64x64',
        shelfLocation: data.shelf_location || "",
        supplierPricing: sp,
        reservedStock: 0,
        packedStock: 0,
        categoryId: data.category || 'N/A'
      };
      
      setSelectedProduct(formatted);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingProduct(false);
    }
  };

  const handleAddAdhocProduct = async (product: any) => {
    // Check if it's already in the list
    for (const group of groupedItems) {
      if (group.items.some((i: any) => i.productId === product.id)) {
        alert("This item is already in the list!");
        setIsAddDialogOpen(false);
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
      
      setIsAddDialogOpen(false);
      setProductSearch("");
      fetchData(); // Reload from DB so it becomes a real draft item
    } catch (e: any) {
      alert("Failed to add product: " + e.message);
    } finally {
      setIsSearchingProducts(false);
    }
  };

  const handleAssignSupplier = async (productId: string, newSupplierId: string) => {
    if (!newSupplierId) return;
    try {
      const res = await fetch("/api/inventory/procurement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, newSupplierId })
      });
      if (!res.ok) throw new Error(await res.text());
      
      // Reload to re-group
      fetchData();
    } catch (e: any) {
      alert("Failed to assign supplier: " + e.message);
    }
  };

  const handleDeleteDraftItem = async (draftItemId: string | null) => {
    if (!draftItemId) return;
    if (!confirm("Are you sure you want to remove this item from the procurement sheet?")) return;

    try {
      const res = await fetch(`/api/inventory/procurement?draftItemId=${draftItemId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error(await res.text());
      fetchData();
    } catch (e: any) {
      alert("Failed to delete item: " + e.message);
    }
  };

  const handleReportIssue = async () => {
    if (!issueProduct || !issueNote.trim()) {
      alert("Please enter a note describing why this item cannot be purchased.");
      return;
    }

    setIsSubmittingIssue(true);
    try {
      const res = await fetch('/api/inventory/products/issue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: issueProduct.productId,
          note: issueNote.trim()
        })
      });

      if (!res.ok) throw new Error(await res.text());
      
      alert("Issue reported successfully! It will now appear on the main dashboard for Sales.");
      setIssueDialogOpen(false);
      setIssueProduct(null);
      setIssueNote("");
      // Optionally we could fetch data again if we displayed it here, but we don't.
    } catch (e: any) {
      alert("Failed to report issue: " + e.message);
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  const handleSubmitPurchases = async (targetSupplierId: string | null, groupItems: any[]) => {
    // Filter only items that have a quantity entered AND belong to this visual group
    const targetGroupSupplier = targetSupplierId || '';
    const itemIdsInGroup = new Set(groupItems.map((i: any) => i.productId));
    
    const validPurchases = Object.entries(purchases)
      .filter(([productId, data]) => data.qty && Number(data.qty) > 0 && itemIdsInGroup.has(productId))
      .map(([productId, data]) => ({
        productId,
        qty: Number(data.qty),
        cost: Number(data.cost || 0),
        supplierId: data.supplierId,
        draftItemId: data.draftItemId
      }));

    if (validPurchases.length === 0) {
      return alert("Please enter a purchased quantity for at least one item.");
    }

    setIsSubmitting(targetGroupSupplier);
    try {
      const res = await fetch("/api/inventory/procurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchases: validPurchases })
      });

      if (!res.ok) throw new Error(await res.text());

      alert("Successfully recorded purchases as Pending Purchase Orders!");
      // Clear inputs
      setPurchases({});
      fetchData();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyOrder = (supplierName: string, groupItems: any[]) => {
    const itemIdsInGroup = new Set(groupItems.map((i: any) => i.productId));
    const validPurchases = Object.entries(purchases)
      .filter(([productId, data]) => data.qty && Number(data.qty) > 0 && itemIdsInGroup.has(productId));

    if (validPurchases.length === 0) {
      return alert("No items have a quantity to order!");
    }

    let text = "";
    
    validPurchases.forEach(([productId, data]) => {
      const item = groupItems.find(i => i.productId === productId);
      if (item) {
        text += `${data.qty}x ${item.productName}\n`;
      }
    });

    navigator.clipboard.writeText(text.trim()).then(() => {
      alert("Order copied to clipboard! You can now paste it into Messenger.");
    }).catch(err => {
      alert("Failed to copy text: " + err);
    });
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading Procurement Sheet...</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 bg-white shadow rounded-lg mt-8">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Procurement Master Sheet</h1>
          <p className="text-slate-600">Your confidential shopping list. Enter what you bought and it will be sent to the inventory team as a Pending Shipment.</p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 flex items-center gap-2">
          <PlusCircle className="w-5 h-5" /> Add Missing Item
        </Button>
      </div>

      {groupedItems.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border rounded-lg text-slate-500">
          No items currently out of stock!
        </div>
      ) : (
        <div className="space-y-10">
          {groupedItems.map(group => (
            <div key={group.id || 'unassigned'} className="border rounded-lg overflow-hidden shadow-sm">
              <div className={`px-4 py-3 border-b flex justify-between items-center ${group.id === null ? 'bg-orange-100' : 'bg-slate-100'}`}>
                <h2 className="text-xl font-bold text-slate-800">{group.name}</h2>
                <div className="flex items-center gap-2">
                  {group.id !== null && (
                    <Button 
                      variant="outline"
                      onClick={() => handleCopyOrder(group.name, group.items)}
                      className="text-slate-600 font-bold px-4 py-1 h-auto flex items-center gap-2"
                    >
                      <Copy className="w-4 h-4" /> Copy Order
                    </Button>
                  )}
                  <Button 
                    onClick={() => handleSubmitPurchases(group.id, group.items)} 
                    disabled={isSubmitting !== false && isSubmitting !== (group.id || '')} 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-1 h-auto"
                  >
                    {isSubmitting === (group.id || '') ? "Recording..." : `Record ${group.name !== 'Unassigned (No Supplier)' ? group.name : ''} Purchases`}
                  </Button>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[900px]">
                  <thead>
                  <tr className="bg-slate-50 text-slate-500 text-sm border-b">
                    <th className="p-3 text-left w-1/3">Product</th>
                    <th className="p-3 text-center">System Qty</th>
                    <th className="p-3 text-center">Staff Req.</th>
                    <th className="p-3 text-left w-1/5">Assign Supplier</th>
                    <th className="p-3 text-left w-32">Unit Cost</th>
                    <th className="p-3 text-left w-32">Final Qty Bought</th>
                    <th className="p-3 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y text-slate-700">
                  {group.items.map((item: any) => {
                    const pState = purchases[item.productId] || { qty: '', cost: item.unitCost || '', supplierId: item.supplierId || '', draftItemId: null };
                    
                    const hasDiscrepancy = item.staffRequestedQty !== null && item.systemQty !== item.staffRequestedQty;

                    return (
                      <tr key={item.productId} className={hasDiscrepancy ? "bg-orange-50 hover:bg-orange-100" : "hover:bg-slate-50"}>
                        <td className="p-3 font-medium text-slate-900">
                          <button 
                            type="button" 
                            onClick={() => handleProductClick(item.productId)} 
                            disabled={isLoadingProduct}
                            className="text-indigo-600 hover:text-indigo-800 hover:underline text-left font-medium disabled:opacity-50"
                          >
                            {item.productName}
                          </button>
                          {hasDiscrepancy && (
                              <div className="text-xs font-bold text-orange-600 mt-1">
                                  ⚠️ Discrepancy detected. Ask the staff for a reason.
                              </div>
                          )}
                          {group.id === null && (
                            <div className="mt-2 flex items-center gap-2">
                              <select 
                                className="text-xs border rounded p-1 text-slate-500 bg-white"
                                onChange={(e) => setPendingSupplier(prev => ({ ...prev, [item.productId]: e.target.value }))}
                                value={pendingSupplier[item.productId] || ""}
                              >
                                <option value="" disabled>Select Default Supplier...</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                              {pendingSupplier[item.productId] && (
                                <Button 
                                  size="sm" 
                                  className="h-7 px-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                                  onClick={() => {
                                    handleAssignSupplier(item.productId, pendingSupplier[item.productId]);
                                    setPendingSupplier(prev => { const n = {...prev}; delete n[item.productId]; return n; });
                                  }}
                                >
                                  Save
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3 font-bold text-slate-500 text-center text-lg">{item.systemQty}</td>
                        <td className={`p-3 font-bold text-center text-lg ${hasDiscrepancy ? "text-orange-600" : "text-green-600"}`}>
                            {item.staffRequestedQty !== null ? item.staffRequestedQty : <span className="text-xs text-slate-400 font-normal">Pending</span>}
                        </td>
                        <td className="p-3">
                          <select 
                            className="w-full border p-2 rounded-md"
                            value={pState.supplierId}
                            onChange={(e) => handleUpdatePurchase(item.productId, 'supplierId', e.target.value)}
                          >
                            <option value="">-- No Supplier --</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </td>
                        <td className="p-3">
                          <input 
                            type="number" 
                            className="w-full border p-2 rounded-md" 
                            placeholder="0.00"
                            value={pState.cost}
                            onChange={(e) => handleUpdatePurchase(item.productId, 'cost', e.target.value)}
                          />
                        </td>
                        <td className="p-3 bg-indigo-50/50">
                          <input 
                            type="number" 
                            className="w-full border border-indigo-300 p-2 rounded-md focus:ring-2 focus:ring-indigo-500 font-bold text-indigo-900" 
                            placeholder="Qty Bought"
                            value={pState.qty}
                            onChange={(e) => handleUpdatePurchase(item.productId, 'qty', e.target.value)}
                          />
                        </td>
                        <td className="p-3 text-center flex flex-col gap-1 items-center justify-center">
                          <button 
                            onClick={() => {
                              setIssueProduct(item);
                              setIssueNote("");
                              setIssueDialogOpen(true);
                            }}
                            className="text-slate-400 hover:text-amber-500 transition-colors p-1"
                            title="Report issue / Cannot purchase"
                          >
                            <Flag className="w-5 h-5" />
                          </button>
                          {item.draftItemId && (
                            <button 
                              onClick={() => handleDeleteDraftItem(item.draftItemId)}
                              className="text-slate-400 hover:text-red-500 transition-colors p-1"
                              title="Remove item"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>
          ))}
        </div>
      )}

      <ViewProductDetailsDialog 
        product={selectedProduct} 
        open={selectedProduct !== null} 
        onOpenChange={(open) => !open && setSelectedProduct(null)} 
      />

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
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
            <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-600 flex items-center gap-2">
              <Flag className="w-5 h-5" />
              Report Procurement Issue
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-600">
              Reporting an issue for: <span className="font-semibold text-slate-900">{issueProduct?.productName}</span>
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Why can't this be purchased?</label>
              <textarea
                value={issueNote}
                onChange={e => setIssueNote(e.target.value)}
                placeholder="e.g. Out of stock at all suppliers, Price doubled, Discontinued..."
                className="w-full border rounded-md p-2 text-sm min-h-[100px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIssueDialogOpen(false)}>Cancel</Button>
            <Button 
              type="button" 
              className="bg-amber-600 hover:bg-amber-700 text-white" 
              onClick={handleReportIssue}
              disabled={isSubmittingIssue}
            >
              {isSubmittingIssue ? "Reporting..." : "Submit Issue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
