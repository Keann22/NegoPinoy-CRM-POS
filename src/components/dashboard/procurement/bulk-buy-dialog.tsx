"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OnlineOrderFields, onlineOrderFormFor, trackingPayload, EMPTY_ONLINE_ORDER } from "./online-order-fields";

export function BulkBuyDialog({
  open,
  onOpenChange,
  bulkBuyGroup,
  purchases,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bulkBuyGroup: { id: string | null; name: string } | null;
  purchases: any[];
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // One "Record Selected" = one platform checkout, so the shipment covers all items.
  const [onlineOrder, setOnlineOrder] = useState(EMPTY_ONLINE_ORDER);
  const [duplicateBlocked, setDuplicateBlocked] = useState(false);

  useEffect(() => {
    if (open) setOnlineOrder(onlineOrderFormFor(bulkBuyGroup?.name));
  }, [open, bulkBuyGroup?.name]);

  const handleBulkPurchaseSubmit = async () => {
    setIsSubmitting(true);
    try {
      const apiPurchases = purchases.map(p => ({
        productId: p.productId,
        qty: p.qty,
        cost: p.cost,
        supplierId: p.supplierId,
        draftItemId: p.draftItemId
      }));

      const res = await fetch("/api/inventory/procurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchases: apiPurchases, tracking: trackingPayload(onlineOrder) })
      });
      if (!res.ok) throw new Error(await res.text());
      
      alert(`Successfully recorded ${purchases.length} purchases!`);
      onSuccess();
    } catch(e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Selected Purchases</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-slate-600">
            You are about to record <strong className="text-slate-900">{purchases.length} items</strong> from <strong className="text-indigo-700">{bulkBuyGroup?.name}</strong>.
          </p>
          <p className="text-sm text-slate-600">
            The system will automatically use the <strong>requested quantities</strong> and the <strong>default unit costs</strong>.
          </p>
          <div className="max-h-48 overflow-y-auto bg-slate-50 border rounded p-2 text-sm space-y-1">
            {purchases.map(item => (
              <div key={item.productId} className="flex justify-between border-b pb-1">
                <span className="truncate pr-2 text-slate-700">{item.productName}</span>
                <span className="font-bold shrink-0">{item.qty}x</span>
              </div>
            ))}
          </div>
          <OnlineOrderFields value={onlineOrder} onChange={setOnlineOrder} productIds={purchases.map((p: any) => p.productId)} onBlockedChange={setDuplicateBlocked} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button 
              onClick={handleBulkPurchaseSubmit} 
              disabled={isSubmitting || (!!onlineOrder.route && duplicateBlocked)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {isSubmitting ? "Saving..." : "Confirm & Save All"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
