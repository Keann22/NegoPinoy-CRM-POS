"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Truck } from "lucide-react";
import { ProductPicker } from "./product-picker";
import { OnlineOrderFields, onlineOrderFormFor, trackingPayload, EMPTY_ONLINE_ORDER } from "./online-order-fields";

type Line = { key: number; productId: string; name: string; qty: string; cost: string };

let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, productId: "", name: "", qty: "1", cost: "" });

/**
 * Records a whole online checkout (Pinduoduo, Shopee, ...) as one purchase,
 * including items that aren't on the Procurement Sheet because nothing is
 * short yet (stocking up). Saved through the same POST as Buy / Record Selected.
 */
export function RecordOnlineOrderDialog({
  open,
  onOpenChange,
  suppliers,
  groupedItems,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: any[];
  groupedItems: any[];
  onSuccess: () => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [onlineOrder, setOnlineOrder] = useState(EMPTY_ONLINE_ORDER);
  const [saving, setSaving] = useState(false);

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name;

  useEffect(() => {
    if (!open) return;
    const pdd = suppliers.find((s) => /pin\s*d|pdd/i.test(s.name));
    const id = pdd?.id || "";
    setSupplierId(id);
    setOnlineOrder(onlineOrderFormFor(supplierName(id)));
    setLines([emptyLine()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Pre-fill the last known price; the user overwrites it with today's price.
  const pickProduct = async (key: number, p: { id: string; name: string }) => {
    updateLine(key, { productId: p.id, name: p.name });
    const { data } = await createClient()
      .from("products")
      .select("initial_unit_cost, supplier_pricing")
      .eq("id", p.id)
      .single();
    const fromSupplier = (data?.supplier_pricing || []).find((sp: any) => sp.supplierId === supplierId)?.unitCost;
    const cost = Number(fromSupplier || data?.initial_unit_cost) || 0;
    if (cost > 0) setLines((ls) => ls.map((l) => (l.key === key && l.cost === "" ? { ...l, cost: String(cost) } : l)));
  };

  // A product already on the sheet with a staff request: this buy takes it over, like Buy does.
  const draftItemIdFor = (productId: string) => {
    for (const g of groupedItems) {
      const item = g.items.find((i: any) => i.productId === productId);
      if (item?.draftItemId) return item.draftItemId;
    }
    return null;
  };

  const filled = lines.filter((l) => l.productId);
  const total = filled.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0);

  const save = async () => {
    if (filled.length === 0) return alert("Add at least one item.");
    const bad = filled.find((l) => !Number.isInteger(Number(l.qty)) || Number(l.qty) < 1);
    if (bad) return alert(`Enter a whole quantity of at least 1 for ${bad.name}.`);
    const dup = filled.find((l, i) => filled.findIndex((x) => x.productId === l.productId) !== i);
    if (dup) return alert(`${dup.name} is listed twice. Combine it into one line.`);

    setSaving(true);
    try {
      const purchases = filled.map((l) => ({
        productId: l.productId,
        qty: Number(l.qty),
        cost: Number(l.cost || 0),
        supplierId: supplierId || null,
        draftItemId: draftItemIdFor(l.productId),
      }));
      const res = await fetch("/api/inventory/procurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchases, tracking: trackingPayload(onlineOrder) }),
      });
      if (!res.ok) throw new Error(await res.text());
      onSuccess();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-sky-600" /> Record Online Order
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600 -mt-2">
          One checkout = one order. Add every item you bought, even ones not on the sheet.
        </p>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm text-slate-600">Supplier</label>
            <select
              className="w-full border p-2 rounded-md bg-white"
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setOnlineOrder(onlineOrderFormFor(supplierName(e.target.value)));
              }}
            >
              <option value="">-- No Supplier --</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <label className="text-sm text-slate-600">Items</label>
              <span className="text-xs text-slate-500">
                Total <span className="font-bold text-slate-800">₱{total.toLocaleString("en-PH", { maximumFractionDigits: 2 })}</span>
              </span>
            </div>
            <div className="border rounded-md divide-y">
              {lines.map((l) => (
                <div key={l.key} className="p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <ProductPicker label={l.name || "Search product..."} onSelect={(p) => pickProduct(l.key, p)} />
                    </div>
                    {lines.length > 1 && (
                      <button
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                        className="text-slate-400 hover:text-red-500 p-1 shrink-0"
                        title="Remove line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {l.productId && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        className="w-20 px-2 py-1 border rounded-md text-right text-sm font-bold"
                        value={l.qty}
                        onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                        title="Quantity bought"
                      />
                      <span className="text-xs text-slate-400">pcs ×</span>
                      <div className="relative" title="Unit cost paid">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₱</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-28 pl-5 pr-2 py-1 border rounded-md text-right text-sm"
                          value={l.cost}
                          onChange={(e) => updateLine(l.key, { cost: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setLines((ls) => [...ls, emptyLine()])}
            >
              <Plus className="w-4 h-4 mr-1" /> Add another item
            </Button>
          </div>

          <OnlineOrderFields value={onlineOrder} onChange={setOnlineOrder} />

          <Button
            onClick={save}
            disabled={saving || filled.length === 0}
            className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold h-11"
          >
            {saving ? "Saving..." : `Save order (${filled.length} item${filled.length === 1 ? "" : "s"})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
