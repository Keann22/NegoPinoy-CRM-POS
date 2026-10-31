"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { PurchasedItemsTable } from "@/components/dashboard/procurement/purchased-items-table";
import { SupplierGroupCard } from "@/components/dashboard/procurement/supplier-group-card";
import { ProcurementHeaderActions } from "@/components/dashboard/procurement/procurement-header-actions";
import { ProcurementDialogs } from "@/components/dashboard/procurement/procurement-dialogs";
import { useReceiptDrafts } from "@/hooks/useReceiptDrafts";
import type { ReceiptScanDraft } from "@/types";
import { useRoleCheck } from "@/hooks/useRoleCheck";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function ProcurementSheet() {
  const { isManagement, isLoading: roleLoading } = useRoleCheck();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [groupedItems, setGroupedItems] = useState<any[]>([]);
  const [purchasedItems, setPurchasedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const [onlineOrderOpen, setOnlineOrderOpen] = useState(false);
  const [searchOrdersOpen, setSearchOrdersOpen] = useState(false);
  const [tracking, setTracking] = useState<{ poIds: string[]; title: string } | null>(null);
  const openTracking = (poIds: string[], title: string) => setTracking({ poIds, title });

  const [viewingAllocatedItem, setViewingAllocatedItem] = useState<{ id: string; name: string; context?: 'total' | 'needToBuy' } | null>(null);

  const { drafts, loading: draftsLoading, saveDraft, completeDraft, deleteDraft } = useReceiptDrafts();
  const [savedScansOpen, setSavedScansOpen] = useState(false);
  const [todaysPurchasesOpen, setTodaysPurchasesOpen] = useState(false);
  // Items received today with no purchase entered first - shown as a badge so
  // an unchecked delivery can't be missed.
  const [toCheckCount, setToCheckCount] = useState(0);

  const fetchToCheckCount = async () => {
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
      const res = await fetch(`/api/inventory/procurement/day-purchases?countOnly=1&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setToCheckCount(data.toCheck || 0);
    } catch (e) {
      console.error(e);
    }
  };
  const [activeDraft, setActiveDraft] = useState<ReceiptScanDraft | null>(null);
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [scanGroup, setScanGroup] = useState<{ id: string | null; name: string; items: any[] } | null>(null);

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
    if (roleLoading || !isManagement) return;
    fetchData();
    fetchToCheckCount();
  }, [roleLoading, isManagement]);

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

  // Add Missing Item: owners pick a product and go straight to Buy, so the
  // purchase reaches Receiving in one step (no staff request in between).
  const openBuyForProduct = (product: any, existing: { item: any; groupId: string | null } | null) => {
    if (existing) {
      openBuyDialog(existing.item, existing.groupId);
      return;
    }
    const name = product.variant_name && !product.name.includes(product.variant_name)
      ? `${product.name} [${product.variant_name}]`
      : product.name;
    setBuyDialogData({
      item: { productId: product.id, productName: name },
      qty: '',
      cost: Number(product.initial_unit_cost) > 0 ? String(product.initial_unit_cost) : '',
      supplierId: product.supplier_id || ''
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

  const handleAssignSupplier = async (productId: string, newSupplierId?: string | null, unitCost?: string | number, supplierCode?: string) => {
    if (!newSupplierId && supplierCode === undefined) return;
    try {
      const res = await fetch("/api/inventory/procurement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, newSupplierId, unitCost, supplierCode })
      });
      if (!res.ok) throw new Error(await res.text());
      
      fetchData();
    } catch (e: any) {
      alert("Failed to update supplier or code: " + e.message);
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
    setActiveDraft(null);
    setScanGroup({ id: supplierId, name: supplierName, items: groupItems });
    setScanDialogOpen(true);
  };

  const handleResumeDraft = (draft: ReceiptScanDraft) => {
    setActiveDraft(draft);
    const group = groupedItems.find((g) => g.id === draft.supplierId);
    setScanGroup({
      id: draft.supplierId,
      name: draft.supplierName,
      items: group?.items || [],
    });
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

  // Supplier names and costs are management-only, and this sheet is built
  // around both, so the whole page is closed to everyone else. The API enforces
  // the same rule; this just avoids showing an empty shell.
  if (roleLoading) return <div className="p-8 text-center text-slate-500">Loading...</div>;
  if (!isManagement) {
    return (
      <div className="max-w-xl mx-auto p-8 mt-8 text-center bg-white shadow rounded-lg">
        <h1 className="text-xl font-bold text-slate-800">Admins only</h1>
        <p className="text-slate-600 mt-2">The Procurement Sheet shows suppliers and purchase costs, so it is only available to Owner and Admin accounts.</p>
      </div>
    );
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading Procurement Sheet...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-8 bg-white shadow rounded-lg md:mt-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Procurement Master Sheet</h1>
          <p className="text-slate-600 text-sm md:text-base">Your on-the-go shopping list. Click &apos;Buy&apos; to record items as you shop.</p>
        </div>
        <ProcurementHeaderActions
          onRefresh={() => fetchData(true)}
          refreshing={refreshing}
          onOpenSavedScans={() => setSavedScansOpen(true)}
          draftsCount={drafts.length}
          onOpenTodaysPurchases={() => setTodaysPurchasesOpen(true)}
          toCheckCount={toCheckCount}
          onOpenSearchOrders={() => setSearchOrdersOpen(true)}
          onOpenOnlineOrder={() => setOnlineOrderOpen(true)}
          onOpenAddMissingItem={() => setIsAddDialogOpen(true)}
        />
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
              onRefreshData={fetchData}
              onOpenTracking={openTracking}
            />
          ))}
        </div>
      )}

      {purchasedItems.length > 0 && (
        <PurchasedItemsTable
          items={purchasedItems}
          suppliers={suppliers}
          onOpenTracking={openTracking}
          onOpenSearchDialog={() => setSearchOrdersOpen(true)}
        />
      )}

      <ProcurementDialogs
        suppliers={suppliers}
        groupedItems={groupedItems}
        onRefreshData={fetchData}
        fetchToCheckCount={fetchToCheckCount}
        buyDialogOpen={buyDialogOpen}
        setBuyDialogOpen={setBuyDialogOpen}
        buyDialogData={buyDialogData}
        bulkBuyDialogOpen={bulkBuyDialogOpen}
        setBulkBuyDialogOpen={setBulkBuyDialogOpen}
        bulkBuyGroup={bulkBuyGroup}
        bulkBuyPurchases={bulkBuyPurchases}
        onClearBulkSelection={handleClearBulkSelection}
        selectedProduct={selectedProduct}
        setSelectedProduct={setSelectedProduct}
        isAddDialogOpen={isAddDialogOpen}
        setIsAddDialogOpen={setIsAddDialogOpen}
        onBuyMissingItem={openBuyForProduct}
        issueDialogOpen={issueDialogOpen}
        setIssueDialogOpen={setIssueDialogOpen}
        issueProduct={issueProduct}
        setIssueProduct={setIssueProduct}
        scanDialogOpen={scanDialogOpen}
        setScanDialogOpen={setScanDialogOpen}
        scanGroup={scanGroup}
        activeDraft={activeDraft}
        setActiveDraft={setActiveDraft}
        isManagement={isManagement}
        onScanConfirm={handleScanConfirm}
        saveDraft={saveDraft}
        completeDraft={completeDraft}
        savedScansOpen={savedScansOpen}
        setSavedScansOpen={setSavedScansOpen}
        drafts={drafts}
        draftsLoading={draftsLoading}
        onResumeDraft={handleResumeDraft}
        deleteDraft={deleteDraft}
        todaysPurchasesOpen={todaysPurchasesOpen}
        setTodaysPurchasesOpen={setTodaysPurchasesOpen}
        onlineOrderOpen={onlineOrderOpen}
        setOnlineOrderOpen={setOnlineOrderOpen}
        searchOrdersOpen={searchOrdersOpen}
        setSearchOrdersOpen={setSearchOrdersOpen}
        tracking={tracking}
        setTracking={setTracking}
        openTracking={openTracking}
        viewingAllocatedItem={viewingAllocatedItem}
        setViewingAllocatedItem={setViewingAllocatedItem}
      />
    </div>
  );
}
