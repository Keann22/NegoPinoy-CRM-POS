"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OnlineOrderFields, onlineOrderFormFor, trackingPayload, EMPTY_ONLINE_ORDER } from "./online-order-fields";

export function SingleBuyDialog({
  open,
  onOpenChange,
  buyItem,
  initialQty,
  initialCost,
  initialSupplierId,
  suppliers,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyItem: any;
  initialQty: string;
  initialCost: string;
  initialSupplierId: string;
  suppliers: any[];
  onSuccess: () => void;
}) {
  const [buyForm, setBuyForm] = useState({ qty: '', cost: '', supplierId: '' });
  const [onlineOrder, setOnlineOrder] = useState(EMPTY_ONLINE_ORDER);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const supplierName = (id: string) => suppliers.find(s => s.id === id)?.name;

  useEffect(() => {
    if (open && buyItem) {
      setBuyForm({
        qty: initialQty,
        cost: initialCost,
        supplierId: initialSupplierId,
      });
      setOnlineOrder(onlineOrderFormFor(supplierName(initialSupplierId)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, buyItem, initialQty, initialCost, initialSupplierId]);

  const handleSinglePurchaseSubmit = async () => {
    if (!buyForm.qty || Number(buyForm.qty) <= 0) {
      return alert("Please enter a valid quantity.");
    }
    setIsSubmitting(true);
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
        body: JSON.stringify({ purchases, tracking: trackingPayload(onlineOrder) })
      });
      if (!res.ok) throw new Error(await res.text());
      
      onSuccess();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Purchase</DialogTitle>
        </DialogHeader>
        {buyItem && (
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">{buyItem.productName}</p>
              {buyItem.supplierCode && (
                <p className="text-xs text-slate-500 font-mono mt-0.5" title="Supplier Code">
                  {buyItem.supplierCode}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-slate-600">Supplier</label>
              <select 
                className="w-full border p-2 rounded-md bg-white"
                value={buyForm.supplierId}
                onChange={(e) => {
                  setBuyForm(prev => ({...prev, supplierId: e.target.value}));
                  setOnlineOrder(onlineOrderFormFor(supplierName(e.target.value)));
                }}
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

            <OnlineOrderFields value={onlineOrder} onChange={setOnlineOrder} />

            <Button 
              onClick={handleSinglePurchaseSubmit} 
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-12 text-lg mt-4"
            >
              {isSubmitting ? "Saving..." : "Save Purchase"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
