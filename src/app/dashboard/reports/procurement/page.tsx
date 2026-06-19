"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { ViewProductDetailsDialog } from "@/components/dashboard/view-product-details-dialog";
import { Copy, PlusCircle, Search, Trash2, Flag, ShoppingCart } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
import { useRoleCheck } from "@/hooks/useRoleCheck";

export default function ProcurementSheet() {
  const { isManagement } = useRoleCheck();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [groupedItems, setGroupedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const handleCreateBatch = async () => {
      try {
          const res = await fetch('/api/inventory/procurement-batch', { method: 'POST' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to create batch');
          alert(`Successfully created ${data.batchName}! Check the Receive page to view the batch.`);
      } catch (err: any) {
          alert(`Error: ${err.message}`);
      }
  };

  const [isSubmitting, setIsSubmitting] = useState<boolean | string>(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [pendingSupplier, setPendingSupplier] = useState<Record<string, string>>({});

  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [editedCosts, setEditedCosts] = useState<Record<string, string>>({});  // Dialog state for Single Item Buy
  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [buyItem, setBuyItem] = useState<any>(null);
  const [buyForm, setBuyForm] = useState({ qty: '', cost: '', supplierId: '' });

  // Dialog state for Bulk Buy
  const [bulkBuyDialogOpen, setBulkBuyDialogOpen] = useState(false);
  const [bulkBuyGroup, setBulkBuyGroup] = useState<any>(null);
  const [bulkBuyItems, setBulkBuyItems] = useState<any[]>([]);

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

  const toggleItemSelection = (productId: string) => {
    setSelectedItems(prev => ({...prev, [productId]: !prev[productId]}));
  };

  const toggleGroupSelection = (groupItems: any[]) => {
    const allSelected = groupItems.every((i: any) => selectedItems[i.productId]);
    const newState = { ...selectedItems };
    groupItems.forEach((i: any) => {
      newState[i.productId] = !allSelected;
    });
    setSelectedItems(newState);
  };

  const openBuyDialog = (item: any, groupId: string | null) => {
    setBuyItem(item);
    setBuyForm({ 
      qty: item.staffRequestedQty !== null ? item.staffRequestedQty.toString() : item.systemQty.toString(), 
      cost: editedCosts[item.productId] !== undefined ? editedCosts[item.productId] : (item.unitCost ? item.unitCost.toString() : ''), 
      supplierId: groupId || item.supplierId || '' 
    });
    setBuyDialogOpen(true);
  };

  const handleSinglePurchaseSubmit = async () => {
    if (!buyForm.qty || Number(buyForm.qty) <= 0) {
      return alert("Please enter a valid quantity.");
    }
    setIsSubmitting("single");
    try {
      const purchases = [{
        productId: buyItem.productId,
        qty: Number(buyForm.qty),
        cost: Number(buyForm.cost || 0),
        supplierId: buyForm.supplierId || null,
        draftItemId: buyItem.draftItemId
      }];
      const res = await fetch("/api/inventory/procurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchases })
      });
      if (!res.ok) throw new Error(await res.text());
      
      setBuyDialogOpen(false);
      setBuyItem(null);
      fetchData();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openBulkBuyDialog = (groupId: string | null, groupItems: any[], groupName: string) => {
    const selectedInGroup = groupItems.filter((i: any) => selectedItems[i.productId]);
    if (selectedInGroup.length === 0) {
      return alert("Please select at least one item to purchase.");
    }
    setBulkBuyGroup({ id: groupId, name: groupName });
    setBulkBuyItems(selectedInGroup);
    setBulkBuyDialogOpen(true);
  };

  const handleBulkPurchaseSubmit = async () => {
    setIsSubmitting("bulk");
    try {
      const purchases = bulkBuyItems.map((item: any) => ({
        productId: item.productId,
        qty: item.staffRequestedQty !== null ? item.staffRequestedQty : item.systemQty,
        cost: editedCosts[item.productId] !== undefined ? Number(editedCosts[item.productId]) : Number(item.unitCost || 0),
        supplierId: item.supplierId || bulkBuyGroup.id || null,
        draftItemId: item.draftItemId
      }));

      const res = await fetch("/api/inventory/procurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchases })
      });
      if (!res.ok) throw new Error(await res.text());
      
      alert(`Successfully recorded ${bulkBuyItems.length} purchases!`);
      
      // Clear selection for these items
      const newSelected = { ...selectedItems };
      bulkBuyItems.forEach((i: any) => delete newSelected[i.productId]);
      setSelectedItems(newSelected);
      
      setBulkBuyDialogOpen(false);
      fetchData();
    } catch(e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
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

  const handleAssignSupplier = async (productId: string, newSupplierId: string, unitCost?: string | number) => {
    if (!newSupplierId) return;
    try {
      const res = await fetch("/api/inventory/procurement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, newSupplierId, unitCost })
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
      const res = await fetch('/api/inventory/issues', {
        method: 'POST',
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
    } catch (e: any) {
      alert("Failed to report issue: " + e.message);
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  const handleCopyOrder = (supplierName: string, groupItems: any[]) => {
    let text = "";
    
    groupItems.forEach((item: any) => {
      if (item.neededQty && Number(item.neededQty) > 0) {
        text += `${item.neededQty}x ${item.productName}\n`;
      }
    });

    if (!text) {
      return alert("No items have a quantity to order!");
    }

    navigator.clipboard.writeText(text.trim()).then(() => {
      alert("Order copied to clipboard! You can now paste it into Messenger.");
    }).catch(err => {
      alert("Failed to copy text: " + err);
    });
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading Procurement Sheet...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-8 bg-white shadow rounded-lg md:mt-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Procurement Master Sheet</h1>
          <p className="text-slate-600 text-sm md:text-base">Your on-the-go shopping list. Click 'Buy' to record items as you shop.</p>
        </div>
        <div className="flex flex-col md:flex-row gap-2">
            {isManagement && (
                <Button onClick={handleCreateBatch} variant="secondary" className="font-bold px-4 py-2">
                    Create Procurement Batch
                </Button>
            )}
            <Button onClick={() => setIsAddDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 flex items-center justify-center gap-2">
              <PlusCircle className="w-5 h-5" /> Add Missing Item
            </Button>
        </div>
      </div>

      {groupedItems.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border rounded-lg text-slate-500">
          No items currently out of stock or requested!
        </div>
      ) : (
        <div className="space-y-10">
          {groupedItems.map(group => (
            <div key={group.id || 'unassigned'} className="border rounded-lg overflow-hidden shadow-sm">
              <div className={`px-4 py-3 border-b flex flex-col md:flex-row justify-between md:items-center gap-3 ${group.id === null ? 'bg-orange-100' : 'bg-slate-100'}`}>
                <h2 className="text-xl font-bold text-slate-800">{group.name}</h2>
                <div className="flex items-center gap-2">
                  {group.id !== null && (
                    <Button 
                      variant="outline"
                      onClick={() => handleCopyOrder(group.name, group.items)}
                      className="text-slate-600 font-bold px-3 py-1 h-auto flex items-center gap-2 text-xs md:text-sm"
                    >
                      <Copy className="w-4 h-4" /> Copy Order
                    </Button>
                  )}
                  <Button 
                    onClick={() => openBulkBuyDialog(group.id, group.items, group.name)} 
                    disabled={group.items.filter((i: any) => selectedItems[i.productId]).length === 0} 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1 h-auto text-xs md:text-sm disabled:opacity-50"
                  >
                    Record Selected
                  </Button>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[600px]">
                  <thead>
                  <tr className="bg-slate-50 text-slate-500 text-sm border-b">
                    <th className="p-3 w-10 text-center">
                      <input type="checkbox" onChange={() => toggleGroupSelection(group.items)} checked={group.items.length > 0 && group.items.every((i: any) => selectedItems[i.productId])} className="w-5 h-5 cursor-pointer accent-indigo-600" />
                    </th>
                    <th className="p-3 text-left w-1/3">Product</th>
                    <th className="p-3 text-center">Current Stock</th>
                    <th className="p-3 text-center">Staff Req.</th>
                    <th className="p-3 text-center w-32">Unit Cost</th>
                    <th className="p-3 text-center w-28">Buy Action</th>
                    <th className="p-3 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y text-slate-700">
                  {group.items.map((item: any) => {
                    const hasDiscrepancy = item.staffRequestedQty !== null && item.systemQty !== item.staffRequestedQty;

                    return (
                      <tr key={item.productId} className={hasDiscrepancy ? "bg-orange-50 hover:bg-orange-100" : "hover:bg-slate-50 transition-colors"}>
                        <td className="p-3 text-center">
                          <input type="checkbox" onChange={() => toggleItemSelection(item.productId)} checked={!!selectedItems[item.productId]} className="w-5 h-5 cursor-pointer accent-indigo-600" />
                        </td>
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
                                  ⚠️ Discrepancy detected.
                              </div>
                          )}
                          {group.id === null && (
                            <div className="mt-2 flex items-center gap-2">
                              <select 
                                className="text-xs border rounded p-1 text-slate-500 bg-white"
                                onChange={(e) => setPendingSupplier(prev => ({ ...prev, [item.productId]: e.target.value }))}
                                value={pendingSupplier[item.productId] || ""}
                              >
                                <option value="" disabled>Select Supplier...</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                              {pendingSupplier[item.productId] && (
                                <Button 
                                  size="sm" 
                                  className="h-7 px-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                                  onClick={() => {
                                    handleAssignSupplier(item.productId, pendingSupplier[item.productId], editedCosts[item.productId] !== undefined ? editedCosts[item.productId] : item.unitCost);
                                    setPendingSupplier(prev => { const n = {...prev}; delete n[item.productId]; return n; });
                                  }}
                                >
                                  Save
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3 font-bold text-slate-500 text-center text-lg">{item.currentStock}</td>
                        <td className={`p-3 font-bold text-center text-lg ${hasDiscrepancy ? "text-orange-600" : "text-green-600"}`}>
                            {item.staffRequestedQty !== null ? item.staffRequestedQty : <span className="text-xs text-slate-400 font-normal">Pending</span>}
                        </td>
                        <td className="p-3 text-center">
                          <div className="relative flex items-center justify-center">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₱</span>
                            <input 
                              type="number"
                              className="w-24 pl-7 pr-2 py-1.5 border rounded-md text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                              value={editedCosts[item.productId] !== undefined ? editedCosts[item.productId] : (item.unitCost || '')}
                              onChange={(e) => setEditedCosts(prev => ({...prev, [item.productId]: e.target.value}))}
                              placeholder="0.00"
                            />
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <Button 
                            size="sm" 
                            className="bg-emerald-600 hover:bg-emerald-700 text-white w-full flex items-center justify-center gap-2 font-bold"
                            onClick={() => openBuyDialog(item, group.id)}
                          >
                            <ShoppingCart className="w-4 h-4" /> Buy
                          </Button>
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

      {/* SINGLE ITEM BUY DIALOG */}
      <Dialog open={buyDialogOpen} onOpenChange={setBuyDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Purchase</DialogTitle>
          </DialogHeader>
          {buyItem && (
            <div className="space-y-4 py-4">
              <p className="text-sm font-semibold text-slate-800">{buyItem.productName}</p>
              
              <div className="space-y-2">
                <label className="text-sm text-slate-600">Supplier</label>
                <select 
                  className="w-full border p-2 rounded-md bg-white"
                  value={buyForm.supplierId}
                  onChange={(e) => setBuyForm(prev => ({...prev, supplierId: e.target.value}))}
                >
                  <option value="">-- No Supplier --</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-slate-600">Qty Bought</label>
                  <input 
                    type="number" 
                    className="w-full border border-indigo-300 p-2 rounded-md focus:ring-2 focus:ring-indigo-500 font-bold text-indigo-900 text-lg" 
                    value={buyForm.qty}
                    onChange={(e) => setBuyForm(prev => ({...prev, qty: e.target.value}))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-600">Unit Cost (₱)</label>
                  <input 
                    type="number" 
                    className="w-full border p-2 rounded-md text-lg" 
                    value={buyForm.cost}
                    onChange={(e) => setBuyForm(prev => ({...prev, cost: e.target.value}))}
                  />
                </div>
              </div>

              <Button 
                onClick={handleSinglePurchaseSubmit} 
                disabled={isSubmitting === "single"}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-12 text-lg mt-4"
              >
                {isSubmitting === "single" ? "Saving..." : "Save Purchase"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* BULK BUY DIALOG */}
      <Dialog open={bulkBuyDialogOpen} onOpenChange={setBulkBuyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Selected Purchases</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-600">
              You are about to record <strong className="text-slate-900">{bulkBuyItems.length} items</strong> from <strong className="text-indigo-700">{bulkBuyGroup?.name}</strong>.
            </p>
            <p className="text-sm text-slate-600">
              The system will automatically use the <strong>requested quantities</strong> and the <strong>default unit costs</strong>.
            </p>
            <div className="max-h-48 overflow-y-auto bg-slate-50 border rounded p-2 text-sm space-y-1">
              {bulkBuyItems.map(item => (
                <div key={item.productId} className="flex justify-between border-b pb-1">
                  <span className="truncate pr-2 text-slate-700">{item.productName}</span>
                  <span className="font-bold shrink-0">{item.staffRequestedQty !== null ? item.staffRequestedQty : item.systemQty}x</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setBulkBuyDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleBulkPurchaseSubmit} 
                disabled={isSubmitting === "bulk"}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              >
                {isSubmitting === "bulk" ? "Saving..." : "Confirm & Save All"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
