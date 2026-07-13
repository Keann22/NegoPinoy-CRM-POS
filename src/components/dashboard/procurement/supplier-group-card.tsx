import React from 'react';
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { ProcurementItemRow } from "@/components/dashboard/procurement/procurement-item-row";

export function SupplierGroupCard({
  group,
  selectedItems,
  toggleItemSelection,
  toggleGroupSelection,
  handleCopyOrder,
  openBulkBuyDialog,
  handleProductClick,
  isLoadingProduct,
  handleSyncInventory,
  suppliers,
  pendingSupplier,
  setPendingSupplier,
  handleAssignSupplier,
  editedCosts,
  setEditedCosts,
  openBuyDialog,
  setIssueProduct,
  setIssueDialogOpen,
  handleDeleteDraftItem,
  setViewingAllocatedItem
}: any) {
  return (
    <div className="border rounded-lg overflow-hidden shadow-sm">
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
            <th className="p-3 text-center">Staff Req. <span className="font-normal normal-case text-[10px] text-slate-400">(note)</span></th>
            <th className="p-3 text-center">Need to Buy <span className="font-normal normal-case text-[10px] text-slate-400">(not yet picked)</span></th>
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
              setPendingSupplier={(val: any) => setPendingSupplier(item.productId, val)}
              handleAssignSupplier={handleAssignSupplier}
              editedCost={editedCosts[item.productId]}
              setEditedCost={(val: any) => setEditedCosts(item.productId, val)}
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
  );
}
