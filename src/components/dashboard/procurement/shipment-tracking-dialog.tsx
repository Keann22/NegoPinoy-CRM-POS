"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, ChevronRight, Copy, Plus, Trash2, Truck } from "lucide-react";
import {
  daysSince,
  findStage,
  PHASE_LABELS,
  ROUTE_LABELS,
  ROUTE_STAGES,
  stageIndex,
  transitStatus,
  type TrackingRoute,
} from "@/lib/online-order-tracking";
import { STATUS_STYLES } from "./in-transit-chip";
import { ProductPicker } from "./product-picker";

type Tracking = {
  po: {
    id: string;
    orderedAt: string;
    route: TrackingRoute | null;
    platformOrderNo: string | null;
    trackingNo: string | null;
    stage: string | null;
    stageAt: string | null;
    expectedArrival: string | null;
  };
  items: { id: string; productName: string; supplierName: string | null; expectedQty: number; receivedQty: number; unitCost: number }[];
  events: { id: string; stage: string; note: string | null; by: string | null; at: string }[];
};

const fmtPht = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const fmtDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

/** Shipment details and stage updates for one or more online-order purchase orders. */
export function ShipmentTrackingDialog({
  open,
  onOpenChange,
  poIds,
  title,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poIds: string[];
  title?: string;
  onChanged?: () => void;
}) {
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [data, setData] = useState<Tracking | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ route: "" as TrackingRoute | "", platformOrderNo: "", trackingNo: "", expectedArrival: "" });
  const [note, setNote] = useState("");
  // Qty / unit cost typed per purchase line, keyed by item id (online prices change often).
  const [edits, setEdits] = useState<Record<string, { qty: string; cost: string }>>({});
  const [showReceived, setShowReceived] = useState(false);
  const [newLine, setNewLine] = useState({ productId: "", name: "", qty: "1", cost: "" });

  useEffect(() => {
    if (open) setSelectedPoId(poIds[0] || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, poIds.join(",")]);

  const applyData = (d: Tracking) => {
    setData(d);
    setEdits(Object.fromEntries(d.items.map((it) => [it.id, { qty: String(it.expectedQty), cost: it.unitCost ? String(it.unitCost) : "" }])));
    setForm({
      route: d.po.route || "",
      platformOrderNo: d.po.platformOrderNo || "",
      trackingNo: d.po.trackingNo || "",
      expectedArrival: d.po.expectedArrival || "",
    });
  };

  useEffect(() => {
    if (!open || !selectedPoId) return;
    setLoading(true);
    setData(null);
    setNote("");
    setShowReceived(false);
    setNewLine({ productId: "", name: "", qty: "1", cost: "" });
    fetch(`/api/inventory/procurement/tracking?poId=${selectedPoId}`, { cache: "no-store" })
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Failed to load shipment");
        applyData(d);
      })
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, [open, selectedPoId]);

  const save = async (patch: Record<string, any>) => {
    if (!selectedPoId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/inventory/procurement/tracking", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poId: selectedPoId, ...patch }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to save");
      applyData(d);
      setNote("");
      onChanged?.();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const lineChanges = (it: Tracking["items"][number]) => {
    const e = edits[it.id];
    if (!e) return null;
    const patch: { qty?: number; unitCost?: number } = {};
    if (e.qty !== "" && Number(e.qty) !== it.expectedQty) patch.qty = Number(e.qty);
    if (e.cost !== "" && Number(e.cost) !== it.unitCost) patch.unitCost = Number(e.cost);
    return Object.keys(patch).length > 0 ? patch : null;
  };
  const changedLines = (data?.items || []).filter((it) => lineChanges(it));

  const reload = async () => {
    if (!selectedPoId) return;
    const res = await fetch(`/api/inventory/procurement/tracking?poId=${selectedPoId}`, { cache: "no-store" });
    const d = await res.json();
    if (!res.ok) {
      // Removing the last line deletes the purchase itself.
      onOpenChange(false);
      return;
    }
    applyData(d);
  };

  // Same correction path as Today's Purchases: updates the purchase line, the
  // product's default cost / supplier price, received stock cost and order COGS.
  const saveLines = async () => {
    setSaving(true);
    try {
      for (const it of changedLines) {
        const res = await fetch("/api/inventory/procurement/day-purchases", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: it.id, ...lineChanges(it) }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(`${it.productName}: ${d.error || "Failed to save"}`);
      }
      await reload();
      onChanged?.();
    } catch (e: any) {
      alert("Error: " + e.message);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const removeLine = async (it: Tracking["items"][number]) => {
    if (!confirm(`Remove ${it.productName} from this purchase?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/inventory/procurement/day-purchases?itemId=${it.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to remove");
      await reload();
      onChanged?.();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const addLine = async () => {
    if (!selectedPoId || !newLine.productId) return alert("Pick a product first.");
    setSaving(true);
    try {
      const res = await fetch("/api/inventory/procurement/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poId: selectedPoId,
          lines: [{ productId: newLine.productId, qty: Number(newLine.qty), cost: Number(newLine.cost || 0) }],
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to add item");
      applyData(d);
      setNewLine({ productId: "", name: "", qty: "1", cost: "" });
      onChanged?.();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const orderTotal = (data?.items || []).reduce(
    (sum, it) => sum + (Number(edits[it.id]?.qty) || 0) * (Number(edits[it.id]?.cost) || 0),
    0
  );
  const waitingItems = (data?.items || []).filter((it) => it.receivedQty < it.expectedQty);
  const receivedItems = (data?.items || []).filter((it) => it.receivedQty >= it.expectedQty);

  const route = data?.po.route || null;
  const stages = route ? ROUTE_STAGES[route] : [];
  const currentIdx = route ? stageIndex(route, data?.po.stage) : -1;
  const current = route ? findStage(route, data?.po.stage) : null;
  const next = currentIdx >= 0 ? stages[currentIdx + 1] : null;
  const status = data?.po.route
    ? transitStatus({ stage: data.po.stage, expectedArrival: data.po.expectedArrival, orderedAt: data.po.orderedAt })
    : null;

  const detailsChanged =
    !!data &&
    (form.platformOrderNo !== (data.po.platformOrderNo || "") ||
      form.trackingNo !== (data.po.trackingNo || "") ||
      form.expectedArrival !== (data.po.expectedArrival || "") ||
      form.route !== (data.po.route || ""));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-sky-600" />
            {title || "Shipment Tracking"}
          </DialogTitle>
        </DialogHeader>

        {poIds.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {poIds.map((id, i) => (
              <button
                key={id}
                onClick={() => setSelectedPoId(id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${id === selectedPoId ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                Shipment {i + 1}
              </button>
            ))}
          </div>
        )}

        {loading || !data ? (
          <div className="py-8 text-center text-slate-500 text-sm">Loading shipment...</div>
        ) : (
          <div className="space-y-5">
            {/* Current stage + quick advance */}
            {route && current && status && (
              <div className={`rounded-lg border p-3 ${STATUS_STYLES[status]}`}>
                <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
                  {PHASE_LABELS[current.phase]} · step {currentIdx + 1} of {stages.length}
                </div>
                <div className="text-lg font-bold">{current.label}</div>
                <div className="text-xs mt-1 opacity-90">
                  Ordered {daysSince(data.po.orderedAt)} days ago
                  {data.po.expectedArrival && <> · expected {fmtDate(data.po.expectedArrival)}</>}
                  {data.po.stageAt && <> · updated {fmtPht(data.po.stageAt)}</>}
                </div>
                {status === "delivered" && (
                  <div className="text-xs mt-2 font-semibold">Delivered — receive it on the Receive page to add it to stock.</div>
                )}
                {next && (
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={() => save({ stage: next.key, note })}
                    className="mt-3 w-full bg-sky-600 hover:bg-sky-700 text-white font-bold"
                  >
                    Mark next: {next.label} <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            )}

            {/* Shipment details */}
            <div className="space-y-3">
              {!route && (
                <p className="text-sm text-slate-600">This purchase isn&apos;t tracked yet. Pick a route to start tracking it.</p>
              )}
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Route</label>
                <select
                  className="w-full border p-2 rounded-md bg-white text-sm"
                  value={form.route}
                  onChange={(e) => setForm((f) => ({ ...f, route: e.target.value as TrackingRoute | "" }))}
                >
                  <option value="">Not tracked</option>
                  {(Object.keys(ROUTE_LABELS) as TrackingRoute[]).map((r) => (
                    <option key={r} value={r}>{ROUTE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-600 flex items-center h-4">Platform order #</label>
                  <input
                    className="w-full border p-2 rounded-md text-sm font-mono"
                    value={form.platformOrderNo}
                    onChange={(e) => setForm((f) => ({ ...f, platformOrderNo: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-600 flex items-center justify-between h-4">
                    Tracking #
                    {data.po.trackingNo && (
                      <button
                        type="button"
                        className="text-sky-600 hover:text-sky-800 flex items-center gap-0.5"
                        onClick={() => navigator.clipboard.writeText(data.po.trackingNo || "")}
                        title="Copy tracking number"
                      >
                        <Copy className="w-3 h-3" /> copy
                      </button>
                    )}
                  </label>
                  <input
                    className="w-full border p-2 rounded-md text-sm font-mono"
                    value={form.trackingNo}
                    onChange={(e) => setForm((f) => ({ ...f, trackingNo: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Expected arrival</label>
                <input
                  type="date"
                  className="w-full border p-2 rounded-md text-sm"
                  value={form.expectedArrival}
                  onChange={(e) => setForm((f) => ({ ...f, expectedArrival: e.target.value }))}
                />
              </div>
              {detailsChanged && (
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    save({
                      route: form.route || null,
                      platformOrderNo: form.platformOrderNo,
                      trackingNo: form.trackingNo,
                      expectedArrival: form.expectedArrival,
                    })
                  }
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  {saving ? "Saving..." : "Save details"}
                </Button>
              )}
            </div>

            {/* All stages — click any to jump there */}
            {route && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 border p-2 rounded-md text-sm"
                    placeholder="Note for the next update (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <Button size="sm" variant="outline" disabled={saving || !note.trim()} onClick={() => save({ note })}>
                    Add note
                  </Button>
                </div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">All stages (click to set)</div>
                <ol className="border rounded-md divide-y max-h-72 overflow-y-auto">
                  {stages.map((s, i) => {
                    const done = i < currentIdx;
                    const isCurrent = i === currentIdx;
                    const newPhase = i === 0 || stages[i - 1].phase !== s.phase;
                    return (
                      <li key={s.key}>
                        {newPhase && (
                          <div className="px-3 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {PHASE_LABELS[s.phase]}
                          </div>
                        )}
                        <button
                          disabled={saving || isCurrent}
                          onClick={() => save({ stage: s.key, note })}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm ${isCurrent ? "bg-sky-50 font-bold text-sky-800" : done ? "text-slate-400 hover:bg-slate-50" : "text-slate-700 hover:bg-slate-50"}`}
                        >
                          <span
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${done ? "bg-emerald-500 border-emerald-500" : isCurrent ? "bg-sky-600 border-sky-600" : "border-slate-300"}`}
                          >
                            {(done || isCurrent) && <Check className="w-3 h-3 text-white" />}
                          </span>
                          {s.label}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {/* What's in this purchase: qty and price actually paid, editable */}
            <div className="space-y-1">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Items in this purchase</div>
                <div className="text-xs text-slate-500">
                  Total <span className="font-bold text-slate-800">₱{orderTotal.toLocaleString("en-PH", { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
              <div className="border rounded-md divide-y text-sm">
                {[...waitingItems, ...(showReceived ? receivedItems : [])].map((it) => {
                  const e = edits[it.id] || { qty: "", cost: "" };
                  const qtyEdited = e.qty !== "" && Number(e.qty) !== it.expectedQty;
                  const costEdited = e.cost !== "" && Number(e.cost) !== it.unitCost;
                  const done = it.receivedQty >= it.expectedQty;
                  return (
                    <div key={it.id} className={`px-3 py-2 space-y-1 ${done ? "bg-slate-50" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-slate-700 min-w-0">
                          {it.productName}
                          {it.supplierName && <span className="text-xs text-slate-400"> · {it.supplierName}</span>}
                        </span>
                        {it.receivedQty === 0 ? (
                          <button
                            onClick={() => removeLine(it)}
                            disabled={saving}
                            className="text-slate-400 hover:text-red-500 p-0.5 shrink-0"
                            title="Remove from this purchase"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          // Received units are in stock and this line is their purchase record.
                          <button
                            onClick={() =>
                              alert(`${it.receivedQty} pcs were already received, so this item can't be removed. Lower the quantity to ${it.receivedQty} instead if the rest won't arrive.`)
                            }
                            className="text-slate-300 cursor-not-allowed p-0.5 shrink-0"
                            title="Already received — lower the quantity instead"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold flex-1 ${done ? "text-emerald-600" : "text-slate-500"}`}>
                          {it.receivedQty > 0 ? `${it.receivedQty} received` : "Not received yet"}
                        </span>
                        <input
                          type="number"
                          min="1"
                          className={`w-16 px-2 py-1 border rounded-md text-right text-sm ${qtyEdited ? "border-amber-400 bg-amber-50" : ""}`}
                          value={e.qty}
                          onChange={(ev) => setEdits((x) => ({ ...x, [it.id]: { ...e, qty: ev.target.value } }))}
                          title="Quantity bought"
                        />
                        <span className="text-xs text-slate-400">pcs ×</span>
                        <div className="relative" title="Unit cost actually paid">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₱</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={`w-24 pl-5 pr-2 py-1 border rounded-md text-right text-sm ${costEdited ? "border-amber-400 bg-amber-50" : ""}`}
                            value={e.cost}
                            onChange={(ev) => setEdits((x) => ({ ...x, [it.id]: { ...e, cost: ev.target.value } }))}
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {receivedItems.length > 0 && (
                  <button
                    onClick={() => setShowReceived((v) => !v)}
                    className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showReceived ? "rotate-180" : ""}`} />
                    {showReceived ? "Hide" : "Show"} {receivedItems.length} already received
                  </button>
                )}
                {/* Add something to this purchase */}
                <div className="px-3 py-2 space-y-2 bg-slate-50/60">
                  <ProductPicker
                    label={newLine.name || "+ Add item to this purchase..."}
                    onSelect={(p) => setNewLine((n) => ({ ...n, productId: p.id, name: p.name }))}
                  />
                  {newLine.productId && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        className="w-16 px-2 py-1 border rounded-md text-right text-sm"
                        value={newLine.qty}
                        onChange={(ev) => setNewLine((n) => ({ ...n, qty: ev.target.value }))}
                        title="Quantity bought"
                      />
                      <span className="text-xs text-slate-400">pcs ×</span>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₱</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-24 pl-5 pr-2 py-1 border rounded-md text-right text-sm"
                          value={newLine.cost}
                          onChange={(ev) => setNewLine((n) => ({ ...n, cost: ev.target.value }))}
                          placeholder="0.00"
                        />
                      </div>
                      <Button size="sm" disabled={saving} onClick={addLine} className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                        <Plus className="w-4 h-4 mr-1" /> Add
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              {changedLines.length > 0 && (
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={saveLines}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  {saving ? "Saving..." : `Save changes to ${changedLines.length} item${changedLines.length > 1 ? "s" : ""}`}
                </Button>
              )}
            </div>

            {/* History */}
            {data.events.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">History</div>
                <ul className="text-xs space-y-1.5">
                  {data.events.map((e) => (
                    <li key={e.id} className="flex gap-2">
                      <span className="text-slate-400 shrink-0 w-28">{fmtPht(e.at)}</span>
                      <span className="text-slate-700">
                        {e.stage !== "note" && <strong>{findStage(route, e.stage)?.label || e.stage}</strong>}
                        {e.note && <span className="text-slate-600">{e.stage !== "note" ? " — " : ""}{e.note}</span>}
                        {e.by && <span className="text-slate-400"> · {e.by}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
