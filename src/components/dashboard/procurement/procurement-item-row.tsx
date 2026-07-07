"use client";

import { Button } from "@/components/ui/button";
import { Flag, ShoppingCart, Trash2 } from "lucide-react";

export function ProcurementItemRow({
  item,
  groupId,
  selected,
  onToggleSelection,
  handleProductClick,
  isLoadingProduct,
  handleSyncInventory,
  suppliers,
  pendingSupplier,
  setPendingSupplier,
  handleAssignSupplier,
  editedCost,
  setEditedCost,
  openBuyDialog,
  onReportIssue,
  handleDeleteDraftItem,
  onViewAllocated,
}: {
  item: any;
  groupId: string | null;
  selected: boolean;
  onToggleSelection: () => void;
  handleProductClick: (id: string) => void;
  isLoadingProduct: boolean;
  handleSyncInventory: (id: string, qty: number) => void;
  suppliers: any[];
  pendingSupplier: string;
  setPendingSupplier: (val: string) => void;
  handleAssignSupplier: (id: string, supplierId: string, cost: string | number) => void;
  editedCost: string;
  setEditedCost: (val: string) => void;
  openBuyDialog: (item: any, groupId: string | null) => void;
  onReportIssue: () => void;
  handleDeleteDraftItem: (id: string) => void;
  onViewAllocated: (item: { id: string; name: string }) => void;
}) {
  const hasDiscrepancy = item.staffRequestedQty !== null && item.systemQty !== item.staffRequestedQty;

  return (
    <tr className={hasDiscrepancy ? "bg-orange-50 hover:bg-orange-100" : "hover:bg-slate-50 transition-colors"}>
      <td className="p-3 text-center">
        <input 
          type="checkbox" 
          onChange={onToggleSelection} 
          checked={selected} 
          className="w-5 h-5 cursor-pointer accent-indigo-600" 
        />
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
            <div className="text-xs font-bold text-orange-600 mt-1 flex items-center gap-2">
                <span>⚠️ Discrepancy detected.</span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-6 px-2 text-[10px] border-orange-200 hover:bg-orange-100 hover:text-orange-700"
                  onClick={() => handleSyncInventory(item.productId, item.staffRequestedQty)}
                >
                  Sync
                </Button>
            </div>
        )}
        {groupId === null && (
          <div className="mt-2 flex items-center gap-2">
            <select 
              className="text-xs border rounded p-1 text-slate-500 bg-white"
              onChange={(e) => setPendingSupplier(e.target.value)}
              value={pendingSupplier || ""}
            >
              <option value="" disabled>Select Supplier...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {pendingSupplier && (
              <Button 
                size="sm" 
                className="h-7 px-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => {
                  handleAssignSupplier(item.productId, pendingSupplier, editedCost !== undefined ? editedCost : item.unitCost);
                  setPendingSupplier("");
                }}
              >
                Save
              </Button>
            )}
          </div>
        )}
      </td>
      <td
        className="p-3 font-bold text-slate-500 text-center text-lg cursor-pointer hover:underline hover:text-indigo-600"
        title="See which orders/customers this stock is allocated to"
        onClick={() => onViewAllocated({ id: item.productId, name: item.productName })}
      >
        {item.currentStock}
      </td>
      <td
        className={`p-3 font-bold text-center text-lg cursor-pointer hover:underline ${hasDiscrepancy ? "text-orange-600" : "text-green-600 hover:text-indigo-600"}`}
        title="See which orders/customers this stock is allocated to"
        onClick={() => onViewAllocated({ id: item.productId, name: item.productName })}
      >
          {item.staffRequestedQty !== null ? item.staffRequestedQty : <span className="text-xs text-slate-400 font-normal">Pending</span>}
      </td>
      <td className="p-3 text-center">
        <div className="relative flex items-center justify-center">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₱</span>
          <input 
            type="number"
            className="w-24 pl-7 pr-2 py-1.5 border rounded-md text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            value={editedCost !== undefined ? editedCost : (item.unitCost || '')}
            onChange={(e) => setEditedCost(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </td>
      <td className="p-3 text-center">
        <Button 
          size="sm" 
          className="bg-emerald-600 hover:bg-emerald-700 text-white w-full flex items-center justify-center gap-2 font-bold"
          onClick={() => openBuyDialog(item, groupId)}
        >
          <ShoppingCart className="w-4 h-4" /> Buy
        </Button>
      </td>
      <td className="p-3 text-center flex flex-col gap-1 items-center justify-center">
        <button 
          onClick={onReportIssue}
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
}
