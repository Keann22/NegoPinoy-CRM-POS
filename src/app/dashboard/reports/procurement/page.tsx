"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { ViewProductDetailsDialog } from "@/components/dashboard/view-product-details-dialog";
import { Copy, PlusCircle } from "lucide-react";

import { SingleBuyDialog } from "@/components/dashboard/procurement/single-buy-dialog";
import { BulkBuyDialog } from "@/components/dashboard/procurement/bulk-buy-dialog";
import { AddMissingItemDialog } from "@/components/dashboard/procurement/add-missing-item-dialog";
import { ReportIssueDialog } from "@/components/dashboard/procurement/report-issue-dialog";
import { ProcurementItemRow } from "@/components/dashboard/procurement/procurement-item-row";
import { ReservedStockDialog } from "@/components/dashboard/reserved-stock-dialog";

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

  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [pendingSupplier, setPendingSupplier] = useState<Record<string, string>>({});

  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [editedCosts, setEditedCosts] = useState<Record<string, string>>({});

  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [buyDialogData, setBuyDialogData] = useState<{item: any, qty: string, cost: string, supplierId: string} | null>(null);

  const [bulkBuyDialogOpen, setBulkBuyDialogOpen] = useState(false);
  const [bulkBuyGroup, setBulkBuyGroup] = useState<any>(null);
  const [bulkBuyPurchases, setBulkBuyPurchases] = useState<any[]>([]);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issueProduct, setIssueProduct] = useState<any>(null);

  const [viewingAllocatedItem, setViewingAllocatedItem] = useState<{ id: string; name: string } | null>(null);

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
    setBuyDialogData({
      item,
      qty: item.staffRequestedQty !== null ? item.staffRequestedQty.toString() : item.systemQty.toString(),
      cost: editedCosts[item.productId] !== undefined ? editedCosts[item.productId] : (item.unitCost ? item.unitCost.toString() : ''),
      supplierId: groupId || item.supplierId || ''
    });
    setBuyDialogOpen(true);
  };

  const openBulkBuyDialog = (groupId: string | null, groupItems: any[], groupName: string) => {
    const selectedInGroup = groupItems.filter((i: any) => selectedItems[i.productId]);
    if (selectedInGroup.length === 0) {
      return alert("Please select at least one item to purchase.");
    }
    
    const purchases = selectedInGroup.map((item: any) => ({
      productId: item.productId,
      productName: item.productName,
      qty: item.staffRequestedQty !== null ? item.staffRequestedQty : item.systemQty,
      cost: editedCosts[item.productId] !== undefined ? Number(editedCosts[item.productId]) : Number(item.unitCost || 0),
      supplierId: item.supplierId || groupId || null,
      draftItemId: item.draftItemId
    }));

    setBulkBuyGroup({ id: groupId, name: groupName });
    setBulkBuyPurchases(purchases);
    setBulkBuyDialogOpen(true);
  };

  const handleClearBulkSelection = () => {
    const newSelected = { ...selectedItems };
    bulkBuyPurchases.forEach((i: any) => delete newSelected[i.productId]);
    setSelectedItems(newSelected);
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

  const handleSyncInventory = async (productId: string, staffRequestedQty: number) => {
    try {
      const res = await fetch('/api/inventory/procurement/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, staffRequestedQty })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync");

      if (data.discrepancy !== 0) {
        alert("Inventory synced successfully!");
      } else {
        alert("Inventory is already in sync!");
      }
      fetchData();
    } catch (e: any) {
      alert("Failed to sync inventory: " + e.message);
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
                  {group.items.map((item: any) => (
                    <ProcurementItemRow
                      key={item.productId}
                      item={item}
                      groupId={group.id}
                      selected={!!selectedItems[item.productId]}
                      onToggleSelection={() => toggleItemSelection(item.productId)}
                      handleProductClick={handleProductClick}
                      isLoadingProduct={isLoadingProduct}
                      handleSyncInventory={handleSyncInventory}
                      suppliers={suppliers}
                      pendingSupplier={pendingSupplier[item.productId] || ""}
                      setPendingSupplier={(val) => setPendingSupplier(prev => ({ ...prev, [item.productId]: val }))}
                      handleAssignSupplier={handleAssignSupplier}
                      editedCost={editedCosts[item.productId]}
                      setEditedCost={(val) => setEditedCosts(prev => ({...prev, [item.productId]: val}))}
                      openBuyDialog={openBuyDialog}
                      onReportIssue={() => {
                        setIssueProduct(item);
                        setIssueDialogOpen(true);
                      }}
                      handleDeleteDraftItem={handleDeleteDraftItem}
                      onViewAllocated={setViewingAllocatedItem}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          ))}
        </div>
      )}

      <SingleBuyDialog
        open={buyDialogOpen}
        onOpenChange={setBuyDialogOpen}
        buyItem={buyDialogData?.item}
        initialQty={buyDialogData?.qty || ''}
        initialCost={buyDialogData?.cost || ''}
        initialSupplierId={buyDialogData?.supplierId || ''}
        suppliers={suppliers}
        onSuccess={() => {
          setBuyDialogOpen(false);
          fetchData();
        }}
      />

      <BulkBuyDialog
        open={bulkBuyDialogOpen}
        onOpenChange={setBulkBuyDialogOpen}
        bulkBuyGroup={bulkBuyGroup}
        purchases={bulkBuyPurchases}
        onSuccess={() => {
          handleClearBulkSelection();
          setBulkBuyDialogOpen(false);
          fetchData();
        }}
      />

      <ViewProductDetailsDialog 
        product={selectedProduct} 
        open={selectedProduct !== null} 
        onOpenChange={(open) => !open && setSelectedProduct(null)} 
      />

      <AddMissingItemDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        groupedItems={groupedItems}
        onSuccess={() => {
          fetchData();
        }}
      />

      <ReportIssueDialog
        open={issueDialogOpen}
        onOpenChange={setIssueDialogOpen}
        issueProduct={issueProduct}
        onSuccess={() => {
          setIssueDialogOpen(false);
          setIssueProduct(null);
        }}
      />

      <ReservedStockDialog
        productId={viewingAllocatedItem?.id || ''}
        productName={viewingAllocatedItem?.name || ''}
        isOpen={!!viewingAllocatedItem}
        onClose={() => setViewingAllocatedItem(null)}
        statusFilter={[
          'Pending Payment', 'Processing', 'Picked', 'Picked (with issue)', 'Photo',
          'Packed', 'For Shipping', 'For Pick-up', 'On-Hold', 'Waiting for Stock',
        ]}
        title="Stock Allocation Details"
      />
    </div>
  );
}
