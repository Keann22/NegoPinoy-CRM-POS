"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import type { SupplierOption } from "@/types";
import type { ReceivedRow, ReceivedKind } from "@/lib/services/purchase-summary-service";

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const NO_SUPPLIER = "No Supplier";
// Nobody has compared these against the supplier's receipt yet.
const NEEDS_CHECK: ReceivedKind[] = ["auto", "unexpected", "draft"];

type Draft = { bought: string; unitCost: string; supplierId: string };

const diffOf = (r: ReceivedRow) => (r.bought === null ? 0 : r.received - r.bought);

// Needs-check first, then real mismatches, then the quiet rows.
const rank = (r: ReceivedRow) => {
  if (NEEDS_CHECK.includes(r.kind)) return 0;
  if (r.kind === "pending") return 2;
  return diffOf(r) !== 0 ? 1 : 3;
};
const byRank = (a: ReceivedRow, b: ReceivedRow) => rank(a) - rank(b) || a.productName.localeCompare(b.productName);

function ResultBadge({ diff, unchecked }: { diff: number; unchecked: boolean }) {
  if (diff > 0) return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 whitespace-nowrap">+{diff} over</Badge>;
  if (diff < 0) return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 whitespace-nowrap">{-diff} short</Badge>;
  if (unchecked) return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 whitespace-nowrap">Not checked</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 whitespace-nowrap">OK</Badge>;
}

export function ReceivedComparison({
  rows,
  suppliers,
  isManagement,
  onSaved,
}: {
  rows: ReceivedRow[];
  suppliers: SupplierOption[];
  isManagement: boolean;
  // Fired after a confirm/record so the popup reloads.
  onSaved: () => Promise<void> | void;
}) {
  // What the admin is typing from the supplier's receipt, keyed by row.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    // Keep whatever is already typed; only seed rows not seen before.
    setDrafts(prev => Object.fromEntries(rows.filter(r => NEEDS_CHECK.includes(r.kind)).map(r => [r.key, prev[r.key] || {
      bought: String(r.received),
      unitCost: r.unitCost ? String(r.unitCost) : "",
      supplierId: r.supplierId || "",
    }])));
  }, [rows]);

  const counts = useMemo(() => ({
    toCheck: rows.filter(r => NEEDS_CHECK.includes(r.kind)).length,
    mismatched: rows.filter(r => (r.kind === "checked" || r.kind === "confirmed") && diffOf(r) !== 0).length,
    pending: rows.filter(r => r.kind === "pending").length,
    ok: rows.filter(r => (r.kind === "checked" || r.kind === "confirmed") && diffOf(r) === 0).length,
  }), [rows]);

  const groups = useMemo(() => {
    // Staff don't get the supplier dimension, so everything is one group.
    const nameOf = (r: ReceivedRow) => (isManagement ? r.supplierName || NO_SUPPLIER : "");
    const map = new Map<string, { supplierName: string; items: ReceivedRow[]; total: number; toCheck: number }>();
    rows.forEach(r => {
      const name = nameOf(r);
      if (!map.has(name)) map.set(name, { supplierName: name, items: [], total: 0, toCheck: 0 });
      const g = map.get(name)!;
      g.items.push(r);
      // Only purchases that exist and have been entered/checked count toward
      // the figure that should match the supplier's receipt.
      if (r.bought !== null) g.total += r.bought * r.unitCost;
      if (NEEDS_CHECK.includes(r.kind)) g.toCheck += 1;
    });
    const list = Array.from(map.values());
    list.forEach(g => g.items.sort(byRank));
    return list.sort((a, b) => {
      if (a.supplierName === NO_SUPPLIER) return 1;
      if (b.supplierName === NO_SUPPLIER) return -1;
      return a.supplierName.localeCompare(b.supplierName);
    });
  }, [rows, isManagement]);

  const save = async (row: ReceivedRow) => {
    const draft = drafts[row.key];
    if (!draft) return;
    setSavingKey(row.key);
    try {
      const res = row.kind !== "auto"
        ? await fetch("/api/inventory/procurement/day-purchases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ movementId: row.movementId, supplierId: draft.supplierId || null, unitCost: draft.unitCost, boughtQty: draft.bought }),
          })
        : await fetch("/api/inventory/procurement/day-purchases", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              itemId: row.itemId,
              qty: draft.bought,
              unitCost: draft.unitCost === "" ? 0 : draft.unitCost,
              supplierId: draft.supplierId || null,
              confirmMovementId: row.movementId,
            }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      await onSaved();
    } catch (e: any) {
      alert("Could not save: " + e.message);
    } finally {
      setSavingKey(null);
    }
  };

  // One product = one line across both panels, so a blank on either side is a
  // visible gap: bought but not received, or received but never bought.
  const renderRow = (row: ReceivedRow) => {
    const unchecked = NEEDS_CHECK.includes(row.kind);
    const draft = drafts[row.key];
    // Admin fills these in from the supplier's receipt.
    const editable = isManagement && unchecked && !!draft;
    const busy = savingKey === row.key;
    const setDraft = (patch: Partial<Draft>) => setDrafts(prev => ({ ...prev, [row.key]: { ...draft, ...patch } }));
    // While typing, compare against the typed quantity so the gap shows before saving.
    const diff = editable && draft.bought !== "" ? row.received - (Number(draft.bought) || 0) : diffOf(row);

    return (
      <div key={row.key} className={`grid grid-cols-2 divide-x border-t ${unchecked ? "bg-amber-50/40" : ""}`}>
        {/* BOUGHT */}
        <div className="p-3 min-w-0">
          {editable ? (
            <div className="space-y-2">
              <p className="text-xs text-amber-800">
                {row.kind === "auto" ? "Nothing entered — filled from the staff count and the last price" : "Nothing entered"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  className="w-16 border border-indigo-300 p-2 rounded-md text-right text-sm font-bold"
                  value={draft.bought}
                  onChange={e => setDraft({ bought: e.target.value })}
                  title="Quantity on the supplier's receipt"
                />
                <span className="text-slate-400 text-sm">×</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="price"
                  className={`w-24 border p-2 rounded-md text-right text-sm ${!(Number(draft.unitCost) > 0) ? "border-amber-400" : ""}`}
                  value={draft.unitCost}
                  onChange={e => setDraft({ unitCost: e.target.value })}
                  title="Unit price on the supplier's receipt"
                />
                <span className="text-sm font-semibold text-slate-700 ml-auto">
                  {peso((Number(draft.bought) || 0) * (Number(draft.unitCost) || 0))}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className={`flex-1 min-w-0 border p-2 rounded-md bg-white text-sm ${!draft.supplierId ? "border-amber-400" : ""}`}
                  value={draft.supplierId}
                  onChange={e => setDraft({ supplierId: e.target.value })}
                >
                  <option value="">-- Select supplier --</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                  onClick={() => save(row)}
                  disabled={busy || savingKey !== null || !(Number(draft.bought) >= 1) || (row.kind !== "auto" && !(Number(draft.unitCost) > 0))}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : row.kind === "auto" ? "Confirm" : "Record"}
                </Button>
              </div>
            </div>
          ) : row.bought === null ? (
            <p className="text-sm text-slate-400 italic">(nothing entered)</p>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-slate-800 min-w-0">{row.productName}</p>
              <p className="text-sm whitespace-nowrap text-right">
                <span className="font-bold">{row.bought}</span>
                {isManagement && <span className="text-slate-500"> × {peso(row.unitCost)}</span>}
                {isManagement && <span className="block text-xs font-semibold text-slate-700">{peso(row.bought * row.unitCost)}</span>}
              </p>
            </div>
          )}
        </div>

        {/* RECEIVED */}
        <div className="p-3 min-w-0">
          {row.kind === "pending" ? (
            <p className="text-sm text-slate-400 italic">(not received)</p>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-slate-800 min-w-0">{row.productName}</p>
              <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 shrink-0 max-w-[45%]">
                <span className="text-sm font-bold">{row.received}</span>
                <ResultBadge diff={diff} unchecked={unchecked} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-slate-50 text-slate-500">
        Nothing was received or bought on this day.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        <span className={`font-semibold ${counts.toCheck > 0 ? "text-amber-700" : "text-slate-900"}`}>{counts.toCheck}</span> to check
        {" · "}<span className={`font-semibold ${counts.mismatched > 0 ? "text-red-700" : "text-slate-900"}`}>{counts.mismatched}</span> don&apos;t match
        {" · "}<span className="font-semibold text-slate-900">{counts.pending}</span> not received yet
        {" · "}<span className="font-semibold text-emerald-700">{counts.ok}</span> OK
      </p>

      {counts.toCheck > 0 && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-3">
          Highlighted items were received without a purchase being entered first, so nothing has been checked against the supplier&apos;s receipt.
          {isManagement
            ? " On the Bought side, type the quantity and unit price from the receipt, then Confirm. Each supplier's total updates as you type, so you can match it to the receipt total first."
            : " An admin needs to check them."}
        </p>
      )}

      {groups.map(group => {
        // What the supplier total becomes once the values typed so far are
        // saved - the number to hold against the receipt before confirming.
        const typed = group.items.reduce((acc, r) => {
          const d = drafts[r.key];
          return NEEDS_CHECK.includes(r.kind) && d ? acc + (Number(d.bought) || 0) * (Number(d.unitCost) || 0) : acc;
        }, 0);
        const receivedItems = group.items.filter(r => r.kind !== "pending");
        return (
          <div key={group.supplierName || "all"} className="border rounded-md overflow-hidden">
            {isManagement && (
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-50">
                <p className="font-semibold text-slate-800">{group.supplierName}</p>
                {group.toCheck > 0 && <span className="text-xs font-medium text-amber-700">{group.toCheck} to check</span>}
              </div>
            )}
            <div className="overflow-x-auto">
              <div className="min-w-[500px]">
                <div className="grid grid-cols-2 divide-x border-t bg-white text-xs font-semibold tracking-wide text-slate-500">
                  <div className="px-3 py-2">BOUGHT</div>
                  <div className="px-3 py-2">RECEIVED</div>
                </div>
                {group.items.map(renderRow)}
                <div className="grid grid-cols-2 divide-x border-t bg-slate-50 text-sm">
                  <div className="px-3 py-2 text-slate-600">
                    {isManagement ? (
                      <>
                        Total: <span className="font-semibold text-slate-900">{peso(group.total)}</span>
                        {group.toCheck > 0 && (
                          <span className="block text-xs text-amber-800">
                            With the values typed above: <span className="font-semibold">{peso(group.total + typed)}</span>
                          </span>
                        )}
                      </>
                    ) : (
                      <>{group.items.filter(r => r.bought !== null).length} items entered</>
                    )}
                  </div>
                  <div className="px-3 py-2 text-slate-600">
                    <span className="font-semibold text-slate-900">{receivedItems.length}</span> {receivedItems.length === 1 ? "item" : "items"}
                    {" · "}<span className="font-semibold text-slate-900">{receivedItems.reduce((acc, r) => acc + r.received, 0).toLocaleString()}</span> pcs
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
