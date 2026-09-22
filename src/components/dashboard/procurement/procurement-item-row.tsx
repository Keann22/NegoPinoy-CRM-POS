"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Flag, ShoppingCart, Trash2, Pencil, Plus } from "lucide-react";
import { StaffRequestDialog } from "./staff-request-dialog";

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
  handleAssignSupplier: (id: string, supplierId?: string | null, cost?: string | number, supplierCode?: string) => void;
  editedCost: string;
  setEditedCost: (val: string) => void;
  openBuyDialog: (item: any, groupId: string | null) => void;
  onReportIssue: () => void;
  handleDeleteDraftItem: (id: string) => void;
  onViewAllocated: (item: { id: string; name: string; context: 'total' | 'needToBuy' }) => void;
}) {
  const [showReassign, setShowReassign] = useState(false);
  const [staffRequestOpen, setStaffRequestOpen] = useState(false);
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [codeDraft, setCodeDraft] = useState(item.supplierCode || "");
  const [isSavingCode, setIsSavingCode] = useState(false);

  const handleSaveCode = async () => {
    setIsSavingCode(true);
    try {
      const targetSupplierId = groupId || item.supplierId || pendingSupplier || null;
      await handleAssignSupplier(
        item.productId,
        targetSupplierId,
        editedCost !== undefined ? editedCost : item.unitCost,
        codeDraft.trim()
      );
      item.supplierCode = codeDraft.trim() || null;
      setIsEditingCode(false);
    } catch (e: any) {
      alert("Failed to save supplier code: " + e.message);
    } finally {
      setIsSavingCode(false);
    }
  };

  return (
    <tr className="hover:bg-slate-50 transition-colors">
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
          className="text-indigo-600 hover:text-indigo-800 hover:underline text-left font-medium disabled:opacity-50 block"
        >
          {item.productName}
        </button>
        {isEditingCode ? (
          <div className="flex items-center gap-1.5 mt-1">
            <input
              type="text"
              value={codeDraft}
              onChange={(e) => setCodeDraft(e.target.value)}
              placeholder="Supplier code (e.g. WK-32-SS)..."
              className="text-xs border border-indigo-300 rounded px-2 py-0.5 w-44 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSaveCode();
                } else if (e.key === "Escape") {
                  setIsEditingCode(false);
                }
              }}
            />
            <Button
              size="sm"
              disabled={isSavingCode}
              className="h-6 px-2 text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleSaveCode}
            >
              {isSavingCode ? "..." : "Save"}
            </Button>
            <button
              type="button"
              onClick={() => setIsEditingCode(false)}
              className="text-[10px] text-slate-400 hover:text-slate-600 px-1"
            >
              Cancel
            </button>
          </div>
        ) : item.supplierCode ? (
          <div className="flex items-center gap-1.5 mt-0.5 group/code">
            <span className="text-xs text-slate-500 font-mono" title="Supplier Code">
              {item.supplierCode}
            </span>
            <button
              type="button"
              onClick={() => {
                setCodeDraft(item.supplierCode || "");
                setIsEditingCode(true);
              }}
              className="text-slate-400 hover:text-indigo-600 p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity"
              title="Edit supplier code"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setCodeDraft("");
              setIsEditingCode(true);
            }}
            className="text-[11px] text-indigo-500 hover:text-indigo-700 hover:underline flex items-center gap-1 mt-0.5"
          >
            <Plus className="w-3 h-3" /> Add supplier code
          </button>
        )}
        {groupId === null ? (
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
        ) : (
          <div className="mt-2">
            {showReassign ? (
              <div className="flex items-center gap-2">
                <select
                  className="text-xs border rounded p-1 text-slate-500 bg-white"
                  onChange={(e) => setPendingSupplier(e.target.value)}
                  value={pendingSupplier || groupId}
                >
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                  disabled={!pendingSupplier || pendingSupplier === groupId}
                  onClick={() => {
                    handleAssignSupplier(item.productId, pendingSupplier, editedCost !== undefined ? editedCost : item.unitCost);
                    setPendingSupplier("");
                    setShowReassign(false);
                  }}
                >
                  Save
                </Button>
                <button
                  type="button"
                  className="text-xs text-slate-400 hover:text-slate-600"
                  onClick={() => { setShowReassign(false); setPendingSupplier(""); }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline"
                onClick={() => setShowReassign(true)}
              >
                Change Supplier
              </button>
            )}
          </div>
        )}
      </td>
      <td
        className="p-3 font-bold text-slate-500 text-center text-lg cursor-pointer hover:underline hover:text-indigo-600"
        title="See which orders/customers this stock is allocated to"
        onClick={() => onViewAllocated({ id: item.productId, name: item.productName, context: 'total' })}
      >
        {item.currentStock}
      </td>
      <td
        className="p-3 text-center"
        title="Manual note from staff — not used to calculate the Buy quantity"
      >
        {item.staffRequestedQty !== null ? (
          <>
            <button 
              className="font-bold text-lg text-slate-500 hover:text-indigo-600 hover:underline"
              onClick={() => setStaffRequestOpen(true)}
            >
              {item.staffRequestedQty}
            </button>
            <StaffRequestDialog
              productId={item.productId}
              productName={item.productName}
              isOpen={staffRequestOpen}
              onClose={() => setStaffRequestOpen(false)}
              staffRequestedQty={item.staffRequestedQty}
              requestedByName={item.requestedByName}
              sourceOrders={item.sourceOrders || []}
            />
          </>
        ) : (
          <span className="font-bold text-lg text-slate-500 text-xs text-slate-400 font-normal">-</span>
        )}
      </td>
      <td
        className="p-3 font-bold text-center text-lg cursor-pointer text-blue-600 hover:underline hover:text-indigo-600"
        title="Orders still waiting on this item to be picked — this is the Buy quantity. Excludes already-packed orders."
        onClick={() => onViewAllocated({ id: item.productId, name: item.productName, context: 'needToBuy' })}
      >
          {item.needToBuyQty > 0 ? item.needToBuyQty : <span className="text-xs text-slate-400 font-normal">None</span>}
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
