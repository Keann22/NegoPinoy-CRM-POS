"use client";

import React from "react";
import { SingleBuyDialog } from "@/components/dashboard/procurement/single-buy-dialog";
import { BulkBuyDialog } from "@/components/dashboard/procurement/bulk-buy-dialog";
import { ViewProductDetailsDialog } from "@/components/dashboard/view-product-details-dialog";
import { AddMissingItemDialog } from "@/components/dashboard/procurement/add-missing-item-dialog";
import { ReportIssueDialog } from "@/components/dashboard/procurement/report-issue-dialog";
import { ScanReceiptDialog } from "@/components/dashboard/procurement/scan-receipt-dialog";
import { SavedReceiptsDialog } from "@/components/dashboard/procurement/saved-receipts-dialog";
import { TodaysPurchasesDialog } from "@/components/dashboard/procurement/todays-purchases-dialog";
import { RecordOnlineOrderDialog } from "@/components/dashboard/procurement/record-online-order-dialog";
import { SearchOnlineOrdersDialog } from "@/components/dashboard/procurement/search-online-orders-dialog";
import { ShipmentTrackingDialog } from "@/components/dashboard/procurement/shipment-tracking-dialog";
import { ReservedStockDialog } from "@/components/dashboard/reserved-stock-dialog";
import type { ReceiptScanDraft, ReceiptScanRow } from "@/types";

interface ProcurementDialogsProps {
  suppliers: any[];
  groupedItems: any[];
  onRefreshData: (isManual?: boolean) => void;
  fetchToCheckCount: () => void;

  // Single buy
  buyDialogOpen: boolean;
  setBuyDialogOpen: (open: boolean) => void;
  buyDialogData: { item: any; qty: string; cost: string; supplierId: string } | null;

  // Bulk buy
  bulkBuyDialogOpen: boolean;
  setBulkBuyDialogOpen: (open: boolean) => void;
  bulkBuyGroup: any;
  bulkBuyPurchases: any[];
  onClearBulkSelection: () => void;

  // Product details
  selectedProduct: any;
  setSelectedProduct: (p: any) => void;

  // Add missing item
  isAddDialogOpen: boolean;
  setIsAddDialogOpen: (open: boolean) => void;
  onBuyMissingItem?: (product: any, existing: { item: any; groupId: string | null } | null) => void;

  // Report issue
  issueDialogOpen: boolean;
  setIssueDialogOpen: (open: boolean) => void;
  issueProduct: any;
  setIssueProduct: (p: any) => void;

  // Scan receipt
  scanDialogOpen: boolean;
  setScanDialogOpen: (open: boolean) => void;
  scanGroup: { id: string | null; name: string; items: any[] } | null;
  activeDraft: ReceiptScanDraft | null;
  setActiveDraft: (d: ReceiptScanDraft | null) => void;
  isManagement: boolean;
  onScanConfirm: (purchases: { productId: string; productName: string; qty: number; cost: number; supplierId: string | null }[]) => void;
  saveDraft: (params: {
    id?: string | null;
    supplierId: string | null;
    supplierName: string;
    imageUrl?: string | null;
    rows: ReceiptScanRow[];
    engine?: string | null;
  }) => Promise<string | null>;
  completeDraft: (draftId: string) => Promise<void>;

  // Saved receipts
  savedScansOpen: boolean;
  setSavedScansOpen: (open: boolean) => void;
  drafts: ReceiptScanDraft[];
  draftsLoading: boolean;
  onResumeDraft: (draft: ReceiptScanDraft) => void;
  deleteDraft: (draftId: string) => void;

  // Today's purchases
  todaysPurchasesOpen: boolean;
  setTodaysPurchasesOpen: (open: boolean) => void;

  // Online orders
  onlineOrderOpen: boolean;
  setOnlineOrderOpen: (open: boolean) => void;
  searchOrdersOpen: boolean;
  setSearchOrdersOpen: (open: boolean) => void;

  // Tracking
  tracking: { poIds: string[]; title: string } | null;
  setTracking: (t: { poIds: string[]; title: string } | null) => void;
  openTracking: (poIds: string[], title: string) => void;

  // Allocated / reserved
  viewingAllocatedItem: { id: string; name: string; context?: "total" | "needToBuy" } | null;
  setViewingAllocatedItem: (item: { id: string; name: string; context?: "total" | "needToBuy" } | null) => void;
}

export function ProcurementDialogs({
  suppliers,
  groupedItems,
  onRefreshData,
  fetchToCheckCount,
  buyDialogOpen,
  setBuyDialogOpen,
  buyDialogData,
  bulkBuyDialogOpen,
  setBulkBuyDialogOpen,
  bulkBuyGroup,
  bulkBuyPurchases,
  onClearBulkSelection,
  selectedProduct,
  setSelectedProduct,
  isAddDialogOpen,
  setIsAddDialogOpen,
  onBuyMissingItem,
  issueDialogOpen,
  setIssueDialogOpen,
  issueProduct,
  setIssueProduct,
  scanDialogOpen,
  setScanDialogOpen,
  scanGroup,
  activeDraft,
  setActiveDraft,
  isManagement,
  onScanConfirm,
  saveDraft,
  completeDraft,
  savedScansOpen,
  setSavedScansOpen,
  drafts,
  draftsLoading,
  onResumeDraft,
  deleteDraft,
  todaysPurchasesOpen,
  setTodaysPurchasesOpen,
  onlineOrderOpen,
  setOnlineOrderOpen,
  searchOrdersOpen,
  setSearchOrdersOpen,
  tracking,
  setTracking,
  openTracking,
  viewingAllocatedItem,
  setViewingAllocatedItem,
}: ProcurementDialogsProps) {
  return (
    <>
      <SingleBuyDialog
        open={buyDialogOpen}
        onOpenChange={setBuyDialogOpen}
        buyItem={buyDialogData?.item}
        initialQty={buyDialogData?.qty || ""}
        initialCost={buyDialogData?.cost || ""}
        initialSupplierId={buyDialogData?.supplierId || ""}
        suppliers={suppliers}
        onSuccess={() => {
          setBuyDialogOpen(false);
          onRefreshData();
        }}
      />

      <BulkBuyDialog
        open={bulkBuyDialogOpen}
        onOpenChange={setBulkBuyDialogOpen}
        bulkBuyGroup={bulkBuyGroup}
        purchases={bulkBuyPurchases}
        onSuccess={() => {
          onClearBulkSelection();
          setBulkBuyDialogOpen(false);
          onRefreshData();
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
          onRefreshData();
        }}
        onBuy={onBuyMissingItem}
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
          onOpenChange={(isOpen) => {
            setScanDialogOpen(isOpen);
            if (!isOpen) setActiveDraft(null);
          }}
          supplierId={scanGroup.id}
          supplierName={scanGroup.name}
          tableItems={scanGroup.items}
          isManagement={isManagement}
          onConfirm={onScanConfirm}
          initialDraft={activeDraft}
          onSaveDraft={saveDraft}
          onCompleteDraft={completeDraft}
        />
      )}

      <SavedReceiptsDialog
        open={savedScansOpen}
        onOpenChange={setSavedScansOpen}
        drafts={drafts}
        loading={draftsLoading}
        onResume={onResumeDraft}
        onDelete={deleteDraft}
      />

      <TodaysPurchasesDialog
        open={todaysPurchasesOpen}
        onOpenChange={setTodaysPurchasesOpen}
        onChanged={() => {
          onRefreshData(true);
          fetchToCheckCount();
        }}
      />

      <RecordOnlineOrderDialog
        open={onlineOrderOpen}
        onOpenChange={setOnlineOrderOpen}
        suppliers={suppliers}
        groupedItems={groupedItems}
        onSuccess={() => {
          setOnlineOrderOpen(false);
          onRefreshData(true);
        }}
      />

      <SearchOnlineOrdersDialog
        open={searchOrdersOpen}
        onOpenChange={setSearchOrdersOpen}
        onOpenTracking={openTracking}
      />

      <ShipmentTrackingDialog
        open={!!tracking}
        onOpenChange={(isOpen) => !isOpen && setTracking(null)}
        poIds={tracking?.poIds || []}
        title={tracking?.title}
        onChanged={() => onRefreshData(true)}
      />

      <ReservedStockDialog
        productId={viewingAllocatedItem?.id || ""}
        productName={viewingAllocatedItem?.name || ""}
        isOpen={!!viewingAllocatedItem}
        onClose={() => setViewingAllocatedItem(null)}
        statusFilter={
          viewingAllocatedItem?.context === "needToBuy"
            ? ["Processing", "Picked (with issue)", "Waiting for Stock"]
            : ["Pending Payment", "Processing", "Picked (with issue)", "On-Hold", "Waiting for Stock"]
        }
        excludeLayaway={viewingAllocatedItem?.context === "needToBuy"}
        title={viewingAllocatedItem?.context === "needToBuy" ? "Orders Needing This Item" : "Total Open Demand"}
      />
    </>
  );
}
