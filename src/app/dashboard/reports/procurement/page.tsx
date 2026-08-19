"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { ViewProductDetailsDialog } from "@/components/dashboard/view-product-details-dialog";
import { PlusCircle, RefreshCw } from "lucide-react";

import { SingleBuyDialog } from "@/components/dashboard/procurement/single-buy-dialog";
import { BulkBuyDialog } from "@/components/dashboard/procurement/bulk-buy-dialog";
import { AddMissingItemDialog } from "@/components/dashboard/procurement/add-missing-item-dialog";
import { ReportIssueDialog } from "@/components/dashboard/procurement/report-issue-dialog";
import { ReservedStockDialog } from "@/components/dashboard/reserved-stock-dialog";
import { PurchasedItemsTable } from "@/components/dashboard/procurement/purchased-items-table";
import { SupplierGroupCard } from "@/components/dashboard/procurement/supplier-group-card";
import { ScanReceiptDialog } from "@/components/dashboard/procurement/scan-receipt-dialog";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
import { useRoleCheck } from "@/hooks/useRoleCheck";

export default function ProcurementSheet() {
  const { isManagement } = useRoleCheck();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [groupedItems, setGroupedItems] = useState<any[]>([]);
  const [purchasedItems, setPurchasedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
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

  const [viewingAllocatedItem, setViewingAllocatedItem] = useState<{ id: string; name: string; context?: 'total' | 'needToBuy' } | null>(null);

  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [scanGroup, setScanGroup] = useState<{ id: string; name: string; items: any[] } | null>(null);

  // isManual keeps the current numbers on screen while re-fetching (only the
  // Refresh button spins), instead of blanking the whole sheet behind the
  // full-page loading state used on first mount.
  const fetchData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch(`/api/inventory/procurement?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      setSuppliers(data.suppliers || []);
      setGroupedItems(data.groupedOutofStock || []);
      setPurchasedItems(data.purchasedItems || []);
    } catch (e: any) {
      console.error(e);
      alert("Failed to load procurement data: " + e.message);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
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

  // needToBuyQty only counts orders where the item hasn't been picked yet —
  // once an order is Picked/Packed/etc., a staff member already pulled a real
  // unit for it, so it no longer needs buying even though it's still "open."
  // That's the number to buy against, not Staff Req. (a stale manual note)
  // and not Current Stock's raw deficit (which also includes already-packed
  // orders, since stock is deducted at order creation, not at pick/pack).
  const suggestedBuyQty = (item: any) => item.needToBuyQty || 0;

  const openBuyDialog = (item: any, groupId: string | null) => {
    setBuyDialogData({
      item,
      qty: suggestedBuyQty(item).toString(),
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
      qty: suggestedBuyQty(item),
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

  const handleSyncInventory = async (productId: string, totalOpenDemandQty: number) => {
    try {
      const res = await fetch('/api/inventory/procurement/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, targetQty: totalOpenDemandQty })
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

  const handleScanReceipt = (supplierId: string, supplierName: string, groupItems: any[]) => {
    setScanGroup({ id: supplierId, name: supplierName, items: groupItems });
    setScanDialogOpen(true);
  };

  // After matching a scanned receipt, reuse the existing bulk Record flow so the
  // whole receipt can be recorded as purchases in one confirm step.
  const handleScanConfirm = (purchases: any[]) => {
    if (!scanGroup) return;
    setScanDialogOpen(false);
    setBulkBuyGroup({ id: scanGroup.id, name: scanGroup.name });
    setBulkBuyPurchases(purchases);
    setBulkBuyDialogOpen(true);
  };

  const handleCopyOrder = async (supplierId: string | null, supplierName: string, groupItems: any[]) => {
    let text = "";
    
    groupItems.forEach((item: any) => {
      const qty = item.needToBuyQty ? Number(item.needToBuyQty) : 0;
      text += `${qty}x ${item.productName}\n`;
    });

    if (!text) {
      return alert("No items found to copy!");
    }

    try {
      await navigator.clipboard.writeText(text.trim());
      alert("Order copied to clipboard! You can now paste it into Messenger.");
    } catch (err: any) {
      alert("Failed to copy text: " + err.message);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading Procurement Sheet...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-8 bg-white shadow rounded-lg md:mt-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Procurement Master Sheet</h1>
          <p className="text-slate-600 text-sm md:text-base">Your on-the-go shopping list. Click &apos;Buy&apos; to record items as you shop.</p>
        </div>
        <div className="flex flex-col md:flex-row gap-2">
            <Button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              variant="outline"
              className="font-bold px-4 py-2 flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
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
            <SupplierGroupCard
              key={group.id || 'unassigned'}
              group={group}
              selectedItems={selectedItems}
              toggleItemSelection={toggleItemSelection}
              toggleGroupSelection={toggleGroupSelection}
              handleCopyOrder={handleCopyOrder}
              handleScanReceipt={handleScanReceipt}
              openBulkBuyDialog={openBulkBuyDialog}
              handleProductClick={handleProductClick}
              isLoadingProduct={isLoadingProduct}
              handleSyncInventory={handleSyncInventory}
              suppliers={suppliers}
              pendingSupplier={pendingSupplier}
              setPendingSupplier={(productId: string, val: string) => setPendingSupplier(prev => ({ ...prev, [productId]: val }))}
              handleAssignSupplier={handleAssignSupplier}
              editedCosts={editedCosts}
              setEditedCosts={(productId: string, val: string) => setEditedCosts(prev => ({...prev, [productId]: val}))}
              openBuyDialog={openBuyDialog}
              setIssueProduct={setIssueProduct}
              setIssueDialogOpen={setIssueDialogOpen}
              handleDeleteDraftItem={handleDeleteDraftItem}
              setViewingAllocatedItem={setViewingAllocatedItem}
            />
          ))}
        </div>
      )}

      {purchasedItems.length > 0 && (
        <PurchasedItemsTable items={purchasedItems} />
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

      {scanGroup && (
        <ScanReceiptDialog
          open={scanDialogOpen}
          onOpenChange={setScanDialogOpen}
          supplierId={scanGroup.id}
          supplierName={scanGroup.name}
          tableItems={scanGroup.items}
          isManagement={isManagement}
          onConfirm={handleScanConfirm}
        />
      )}

      <ReservedStockDialog
        productId={viewingAllocatedItem?.id || ''}
        productName={viewingAllocatedItem?.name || ''}
        isOpen={!!viewingAllocatedItem}
        onClose={() => setViewingAllocatedItem(null)}
        statusFilter={
          viewingAllocatedItem?.context === 'needToBuy' 
            ? ['Processing', 'Picked (with issue)', 'Waiting for Stock'] 
            : ['Pending Payment', 'Processing', 'Picked (with issue)', 'On-Hold', 'Waiting for Stock']
        }
        excludeLayaway={viewingAllocatedItem?.context === 'needToBuy'}
        title={viewingAllocatedItem?.context === 'needToBuy' ? "Orders Needing This Item" : "Total Open Demand"}
      />
    </div>
  );
}
