"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, startOfDay, endOfDay } from "date-fns";
import { ClipboardList, Loader2, Pencil, Trash2, Check, X, AlertTriangle } from "lucide-react";
import type { PurchaseRow, SupplierOption } from "@/types";

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const NO_SUPPLIER = "No Supplier";

// Stock staff received by hand ("unexpected delivery") that has no purchase
// behind it yet - see fetchUnrecordedReceipts.
type UnrecordedReceipt = {
  movementId: string;
  productId: string;
  productName: string;
  qty: number;
  receivedAt: string;
  suggestedSupplierId: string | null;
  suggestedUnitCost: number;
};

function StatusBadge({ item }: { item: PurchaseRow }) {
  if (item.status === "received") {
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Received</Badge>;
  }
  if (item.receivedQty > 0) {
    return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Partial ({item.receivedQty}/{item.qty})</Badge>;
  }
  return <Badge variant="secondary">Pending Receipt</Badge>;
}

export function TodaysPurchasesDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Fired after an edit/removal so the sheet behind can refresh its numbers.
  onChanged: () => void;
}) {
  // <input type="date"> works in local time, which is PHT for this business.
  const [day, setDay] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  // Decided by the server, which also withholds suppliers/costs from staff.
  const [isManagement, setIsManagement] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ qty: "", unitCost: "", supplierId: "" });
  const [savingId, setSavingId] = useState<string | null>(null);

  const [unrecorded, setUnrecorded] = useState<UnrecordedReceipt[]>([]);
  // Supplier/cost being filled in per unrecorded receipt, keyed by movement id.
  const [recordDrafts, setRecordDrafts] = useState<Record<string, { supplierId: string; unitCost: string }>>({});
  const [recordingAll, setRecordingAll] = useState(false);

  const isToday = day === format(new Date(), "yyyy-MM-dd");

  const load = useCallback(async () => {
    if (!day) return;
    setLoading(true);
    try {
      const d = new Date(`${day}T00:00:00`);
      const start = startOfDay(d).toISOString();
      const end = endOfDay(d).toISOString();
      const res = await fetch(
        `/api/inventory/procurement/day-purchases?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load purchases");
      setPurchases(data.purchases || []);
      setSuppliers(data.suppliers || []);
      setIsManagement(!!data.isManagement);
      const rows: UnrecordedReceipt[] = data.unrecorded || [];
      setUnrecorded(rows);
      // Keep whatever is already typed; only seed rows not seen before.
      setRecordDrafts(prev => Object.fromEntries(rows.map(r => [r.movementId, prev[r.movementId] || {
        supplierId: r.suggestedSupplierId || "",
        unitCost: r.suggestedUnitCost ? String(r.suggestedUnitCost) : "",
      }])));
    } catch (e: any) {
      alert("Failed to load purchases: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    if (open) {
      setEditingId(null);
      load();
    }
  }, [open, load]);

  const groups = useMemo(() => {
    const map = new Map<string, { supplierName: string; items: PurchaseRow[]; pieces: number; totalCost: number }>();
    purchases.forEach(p => {
      const name = p.supplierName || NO_SUPPLIER;
      if (!map.has(name)) map.set(name, { supplierName: name, items: [], pieces: 0, totalCost: 0 });
      const g = map.get(name)!;
      g.items.push(p);
      g.pieces += p.qty;
      g.totalCost += p.totalCost;
    });
    // Named suppliers alphabetically, the "No Supplier" bucket last.
    return Array.from(map.values()).sort((a, b) => {
      if (a.supplierName === NO_SUPPLIER) return 1;
      if (b.supplierName === NO_SUPPLIER) return -1;
      return a.supplierName.localeCompare(b.supplierName);
    });
  }, [purchases]);

  const totals = useMemo(() => ({
    pieces: purchases.reduce((acc, p) => acc + p.qty, 0),
    spend: purchases.reduce((acc, p) => acc + p.totalCost, 0),
  }), [purchases]);

  const startEdit = (item: PurchaseRow) => {
    setEditingId(item.id);
    setEditForm({
      qty: String(item.qty),
      unitCost: item.unitCost ? String(item.unitCost) : "",
      supplierId: item.supplierId || "",
    });
  };

  const saveEdit = async (item: PurchaseRow) => {
    setSavingId(item.id);
    try {
      const body: Record<string, any> = { itemId: item.id, qty: editForm.qty };
      if (isManagement) {
        body.unitCost = editForm.unitCost === "" ? 0 : editForm.unitCost;
        body.supplierId = editForm.supplierId || null;
      }
      const res = await fetch("/api/inventory/procurement/day-purchases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setEditingId(null);
      await load();
      onChanged();
    } catch (e: any) {
      alert("Could not save: " + e.message);
    } finally {
      setSavingId(null);
    }
  };

  const removeItem = async (item: PurchaseRow) => {
    if (!confirm(`Remove this purchase?\n\n${item.qty}x ${item.productName}\n\nUse this only if it was recorded by mistake. The item will go back to the shopping list if orders still need it.`)) return;
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/inventory/procurement/day-purchases?itemId=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove");
      await load();
      onChanged();
    } catch (e: any) {
      alert("Could not remove: " + e.message);
    } finally {
      setSavingId(null);
    }
  };

  const postRecord = async (r: UnrecordedReceipt) => {
    const draft = recordDrafts[r.movementId] || { supplierId: "", unitCost: "" };
    const res = await fetch("/api/inventory/procurement/day-purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movementId: r.movementId, supplierId: draft.supplierId || null, unitCost: draft.unitCost }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to record");
  };

  const recordOne = async (r: UnrecordedReceipt) => {
    setSavingId(r.movementId);
    try {
      await postRecord(r);
      await load();
      onChanged();
    } catch (e: any) {
      alert("Could not record: " + e.message);
    } finally {
      setSavingId(null);
    }
  };

  const isReady = (r: UnrecordedReceipt) => {
    const d = recordDrafts[r.movementId];
    return !!d && !!d.supplierId && Number(d.unitCost) > 0;
  };
  const readyCount = unrecorded.filter(isReady).length;

  const recordAllReady = async () => {
    const ready = unrecorded.filter(isReady);
    if (!confirm(`Record ${ready.length} received ${ready.length === 1 ? "item" : "items"} as purchases with the supplier and cost shown?`)) return;
    setRecordingAll(true);
    const failed: string[] = [];
    for (const r of ready) {
      try {
        await postRecord(r);
      } catch (e: any) {
        failed.push(`${r.productName}: ${e.message}`);
      }
    }
    await load();
    onChanged();
    setRecordingAll(false);
    if (failed.length > 0) alert(`Could not record ${failed.length}:\n\n${failed.join("\n")}`);
  };

  const renderRow = (item: PurchaseRow) => {
    const editing = editingId === item.id;
    const busy = savingId === item.id;
    return (
      <tr key={item.id} className={editing ? "bg-indigo-50/60" : "hover:bg-slate-50"}>
        <td className="p-3 font-medium text-slate-800">
          {item.productName}
          {editing && isManagement && (
            <select
              className="mt-2 block w-full border p-2 rounded-md bg-white text-sm font-normal"
              value={editForm.supplierId}
              onChange={e => setEditForm(prev => ({ ...prev, supplierId: e.target.value }))}
            >
              <option value="">-- No Supplier --</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </td>
        <td className="p-3 text-right font-bold">
          {editing ? (
            <input
              type="number"
              inputMode="numeric"
              min={Math.max(1, item.receivedQty)}
              className="w-20 border border-indigo-300 p-2 rounded-md text-right"
              value={editForm.qty}
              onChange={e => setEditForm(prev => ({ ...prev, qty: e.target.value }))}
            />
          ) : item.qty}
        </td>
        {isManagement && (
          <td className="p-3 text-right text-slate-600">
            {editing ? (
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                className="w-24 border p-2 rounded-md text-right"
                value={editForm.unitCost}
                onChange={e => setEditForm(prev => ({ ...prev, unitCost: e.target.value }))}
              />
            ) : peso(item.unitCost)}
          </td>
        )}
        {isManagement && (
          <td className="p-3 text-right font-semibold">
            {editing ? peso((Number(editForm.qty) || 0) * (Number(editForm.unitCost) || 0)) : peso(item.totalCost)}
          </td>
        )}
        <td className="p-3"><StatusBadge item={item} /></td>
        <td className="p-3 text-xs text-slate-400 whitespace-nowrap">{format(new Date(item.purchasedAt), "hh:mm a")}</td>
        <td className="p-3">
          <div className="flex items-center justify-end gap-1">
            {editing ? (
              <>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-2" onClick={() => saveEdit(item)} disabled={busy} title="Save">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingId(null)} disabled={busy} title="Cancel">
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-indigo-700 hover:bg-indigo-50" onClick={() => startEdit(item)} disabled={busy} title="Edit this purchase">
                  <Pencil className="h-4 w-4" />
                </Button>
                {/* Once anything has been received the stock is real, so the buy can only be lowered, not removed. */}
                {item.receivedQty === 0 && (
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => removeItem(item)} disabled={busy} title="Remove (recorded by mistake)">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const tableHead = (
    <thead>
      <tr className="text-slate-500 text-xs border-b bg-white">
        <th className="p-3 text-left font-medium">Product</th>
        <th className="p-3 text-right font-medium">Qty</th>
        {isManagement && <th className="p-3 text-right font-medium">Unit Cost</th>}
        {isManagement && <th className="p-3 text-right font-medium">Total</th>}
        <th className="p-3 text-left font-medium">Status</th>
        <th className="p-3 text-left font-medium">Time</th>
        <th className="p-3" />
      </tr>
    </thead>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-emerald-600" />
            {isToday ? "Today's Purchases" : `Purchases — ${format(new Date(`${day}T00:00:00`), "MMM d, yyyy")}`}
          </DialogTitle>
          <DialogDescription>
            Everything recorded as bought on this day{isManagement ? ", grouped by supplier" : ""}. Use the pencil to fix a mistake.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            type="date"
            className="border p-2 rounded-md text-sm"
            value={day}
            max={format(new Date(), "yyyy-MM-dd")}
            onChange={e => e.target.value && setDay(e.target.value)}
          />
          {!loading && purchases.length > 0 && (
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{purchases.length}</span> {purchases.length === 1 ? "item" : "items"}
              {" · "}<span className="font-semibold text-slate-900">{totals.pieces.toLocaleString()}</span> pcs
              {isManagement && <>{" · "}<span className="font-semibold text-slate-900">{peso(totals.spend)}</span></>}
            </p>
          )}
        </div>

        {!loading && unrecorded.length > 0 && (
          <div className="border border-amber-300 rounded-md overflow-hidden">
            <div className="flex flex-wrap justify-between items-center gap-2 px-4 py-3 bg-amber-50 border-b border-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-900">
                    Received but not recorded as bought — {unrecorded.length} {unrecorded.length === 1 ? "item" : "items"}, {unrecorded.reduce((acc, r) => acc + r.qty, 0).toLocaleString()} pcs
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Staff received these on this day, but no purchase was recorded, so they are not in the totals above.
                    {isManagement ? " Set the supplier and cost to record them." : " An admin needs to record them."}
                  </p>
                </div>
              </div>
              {isManagement && readyCount > 0 && (
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={recordAllReady} disabled={recordingAll || savingId !== null}>
                  {recordingAll && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Record all filled ({readyCount})
                </Button>
              )}
            </div>
            <div className="overflow-x-auto max-h-[45vh] overflow-y-auto">
              <table className={`w-full text-sm ${isManagement ? "min-w-[720px]" : "min-w-[360px]"}`}>
                <thead>
                  <tr className="text-slate-500 text-xs border-b bg-white sticky top-0">
                    <th className="p-3 text-left font-medium">Product</th>
                    <th className="p-3 text-right font-medium">Received</th>
                    {isManagement && <th className="p-3 text-left font-medium">Supplier</th>}
                    {isManagement && <th className="p-3 text-left font-medium">Unit Cost (₱)</th>}
                    <th className="p-3 text-left font-medium">Time</th>
                    {isManagement && <th className="p-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {unrecorded.map(r => {
                    const draft = recordDrafts[r.movementId] || { supplierId: "", unitCost: "" };
                    const busy = savingId === r.movementId;
                    return (
                      <tr key={r.movementId} className="hover:bg-amber-50/40">
                        <td className="p-3 font-medium text-slate-800">{r.productName}</td>
                        <td className="p-3 text-right font-bold">{r.qty}</td>
                        {isManagement && (
                          <td className="p-3">
                            <select
                              className={`w-full min-w-[160px] border p-2 rounded-md bg-white text-sm ${!draft.supplierId ? "border-amber-400" : ""}`}
                              value={draft.supplierId}
                              onChange={e => setRecordDrafts(prev => ({ ...prev, [r.movementId]: { ...draft, supplierId: e.target.value } }))}
                            >
                              <option value="">-- Select supplier --</option>
                              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </td>
                        )}
                        {isManagement && (
                          <td className="p-3">
                            <input
                              type="number"
                              inputMode="decimal"
                              placeholder="0.00"
                              className={`w-24 border p-2 rounded-md text-right ${!(Number(draft.unitCost) > 0) ? "border-amber-400" : ""}`}
                              value={draft.unitCost}
                              onChange={e => setRecordDrafts(prev => ({ ...prev, [r.movementId]: { ...draft, unitCost: e.target.value } }))}
                            />
                          </td>
                        )}
                        <td className="p-3 text-xs text-slate-400 whitespace-nowrap">{format(new Date(r.receivedAt), "hh:mm a")}</td>
                        {isManagement && (
                          <td className="p-3 text-right">
                            <Button size="sm" onClick={() => recordOne(r)} disabled={busy || recordingAll || !(Number(draft.unitCost) > 0)}>
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record"}
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading purchases...
          </div>
        ) : purchases.length === 0 && unrecorded.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-slate-50 text-slate-500">
            No purchases recorded {isToday ? "today" : "on this day"}.
          </div>
        ) : purchases.length === 0 ? null : isManagement ? (
          <div className="space-y-5">
            {groups.map(group => (
              <div key={group.supplierName} className="border rounded-md overflow-hidden">
                <div className="flex flex-wrap justify-between items-center gap-2 px-4 py-3 bg-slate-50 border-b">
                  <p className="font-semibold text-slate-800">{group.supplierName}</p>
                  <p className="text-sm text-slate-500">
                    {group.pieces.toLocaleString()} pcs · <span className="font-semibold text-slate-900">{peso(group.totalCost)}</span>
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    {tableHead}
                    <tbody className="divide-y">{group.items.map(renderRow)}</tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Staff view: supplier identities and costs are management-only, so
          // this is a flat list with no supplier dimension.
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              {tableHead}
              <tbody className="divide-y">{purchases.map(renderRow)}</tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
