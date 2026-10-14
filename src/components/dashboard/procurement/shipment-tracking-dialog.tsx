"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight, Copy, Truck } from "lucide-react";
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
  items: { id: string; productName: string; supplierName: string | null; expectedQty: number; receivedQty: number }[];
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

  useEffect(() => {
    if (open) setSelectedPoId(poIds[0] || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, poIds.join(",")]);

  const applyData = (d: Tracking) => {
    setData(d);
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

            {/* What's in this shipment */}
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Items in this order</div>
              <div className="border rounded-md divide-y text-sm">
                {data.items.map((it) => (
                  <div key={it.id} className="flex justify-between gap-2 px-3 py-1.5">
                    <span className="text-slate-700">
                      {it.productName}
                      {it.supplierName && <span className="text-xs text-slate-400"> · {it.supplierName}</span>}
                    </span>
                    <span className="font-bold shrink-0">
                      {it.receivedQty > 0 ? `${it.receivedQty}/${it.expectedQty} received` : `${it.expectedQty}x`}
                    </span>
                  </div>
                ))}
              </div>
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
