"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Package, Plus, Trash2, Truck } from "lucide-react";
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
  const [duplicateBlocked, setDuplicateBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bundleNote, setBundleNote] = useState("");

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name;

  useEffect(() => {
    if (!open) return;
    const pdd = suppliers.find((s) => /pin\s*d|pdd/i.test(s.name));
    const id = pdd?.id || "";
    setSupplierId(id);
    setOnlineOrder(onlineOrderFormFor(supplierName(id)));
    setLines([emptyLine()]);
    setBundleNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Last known price for this supplier (or the product's default cost); the
  // user overwrites it with today's price.
  const lastCost = (prod: any) => {
    const fromSupplier = (prod?.supplier_pricing || []).find((sp: any) => sp.supplierId === supplierId)?.unitCost;
    return Number(fromSupplier || prod?.initial_unit_cost) || 0;
  };

  const pickProduct = async (key: number, p: { id: string; name: string }) => {
    const supabase = createClient();
    const { data: prod } = await supabase
      .from("products")
      .select("name, variant_name, initial_unit_cost, supplier_pricing, assembly_recipe")
      .eq("id", p.id)
      .single();
    const recipe: any[] = Array.isArray(prod?.assembly_recipe) ? prod.assembly_recipe : [];

    if (recipe.length === 0) {
      const cost = lastCost(prod);
      setLines((ls) => ls.map((l) => (l.key === key ? { ...l, productId: p.id, name: p.name, cost: l.cost || (cost > 0 ? String(cost) : "") } : l)));
      return;
    }

    // Bundles hold no stock and the sheet tracks their parts, so a bundle is
    // recorded as its components (bundle qty x qty per bundle).
    const ids = recipe.map((c) => c.productId || c.component_id).filter(Boolean);
    const { data: parts } = await supabase
      .from("products")
      .select("id, name, variant_name, initial_unit_cost, supplier_pricing")
      .in("id", ids);
    setLines((ls) => {
      const line = ls.find((l) => l.key === key);
      const bundleQty = Number(line?.qty) || 1;
      let next = ls.filter((l) => l.key !== key);
      const added: string[] = [];
      recipe.forEach((c) => {
        const id = c.productId || c.component_id;
        const part = (parts || []).find((x: any) => x.id === id);
        if (!part) return;
        const name = part.variant_name && !part.name.includes(part.variant_name) ? `${part.name} [${part.variant_name}]` : part.name;
        const qty = bundleQty * (Number(c.quantity) || 1);
        added.push(`${qty}x ${name}`);
        const existing = next.find((l) => l.productId === id);
        if (existing) {
          next = next.map((l) => (l.key === existing.key ? { ...l, qty: String((Number(l.qty) || 0) + qty) } : l));
        } else {
          const cost = lastCost(part);
          next = [...next, { key: nextKey++, productId: id, name, qty: String(qty), cost: cost > 0 ? String(cost) : "" }];
        }
      });
      setBundleNote(`"${p.name}" is a bundle, so its parts were added instead: ${added.join(", ")}.`);
      return next.length > 0 ? next : [emptyLine()];
    });
  };

  // What the sheet already has for a product, so it's clear the order is linked to that row.
  const sheetItemFor = (productId: string) => {
    for (const g of groupedItems) {
      const item = g.items.find((i: any) => i.productId === productId);
      if (item) return item;
    }
    return null;
  };

  // A product already on the sheet with a staff request: this buy takes it over, like Buy does.
  const draftItemIdFor = (productId: string) => sheetItemFor(productId)?.draftItemId || null;

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
                  {l.productId && <SheetHint item={sheetItemFor(l.productId)} />}
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
            {bundleNote && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <Package className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{bundleNote}</span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setLines((ls) => [...ls, emptyLine()])}
            >
              <Plus className="w-4 h-4 mr-1" /> Add another item
            </Button>
          </div>

          <OnlineOrderFields value={onlineOrder} onChange={setOnlineOrder} productIds={filled.map((l) => l.productId)} onBlockedChange={setDuplicateBlocked} />

          <Button
            onClick={save}
            disabled={saving || filled.length === 0 || (!!onlineOrder.route && duplicateBlocked)}
            className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold h-11"
          >
            {saving ? "Saving..." : `Save order (${filled.length} item${filled.length === 1 ? "" : "s"})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "On the sheet: Need to Buy 24 · 20 already on the way" for a picked product. */
function SheetHint({ item }: { item: any }) {
  if (!item) {
    return <div className="text-[11px] text-slate-400">Not on the sheet — nothing is short for this item right now.</div>;
  }
  const onTheWay = (item.inTransit || []).reduce((sum: number, s: any) => sum + s.qty, 0);
  return (
    <div className="text-[11px] text-sky-700">
      On the sheet: Need to Buy <span className="font-bold">{item.needToBuyQty > 0 ? item.needToBuyQty : "none"}</span>
      {onTheWay > 0 && <> · <span className="font-bold">{onTheWay}</span> already on the way</>}
      {item.staffRequestedQty != null && <> · staff request {item.staffRequestedQty}</>}
    </div>
  );
}
