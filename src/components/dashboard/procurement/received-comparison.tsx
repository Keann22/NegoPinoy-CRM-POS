"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
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

function StatusBadge({ row }: { row: ReceivedRow }) {
  if (row.kind === "auto") {
    return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100" title="Staff received this off the to-order list and the system created the purchase from their count. Nobody entered what was actually bought.">No purchase entered — not checked</Badge>;
  }
  if (row.kind === "unexpected" || row.kind === "draft") {
    return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">No purchase</Badge>;
  }
  if (row.kind === "pending") return <Badge variant="secondary">Not received yet</Badge>;
  const diff = diffOf(row);
  if (diff === 0) return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">OK</Badge>;
  if (diff > 0) return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">+{diff} over</Badge>;
  return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{-diff} short</Badge>;
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
    const map = new Map<string, { supplierName: string; items: ReceivedRow[]; total: number; toCheck: number }>();
    rows.forEach(r => {
      const name = r.supplierName || NO_SUPPLIER;
      if (!map.has(name)) map.set(name, { supplierName: name, items: [], total: 0, toCheck: 0 });
      const g = map.get(name)!;
      g.items.push(r);
      // Only purchases that exist and have been entered/checked count toward
      // the figure that should match the supplier's receipt.
      if (r.bought !== null) g.total += r.bought * r.unitCost;
      if (NEEDS_CHECK.includes(r.kind)) g.toCheck += 1;
    });
    const list = Array.from(map.values());
    list.forEach(g => g.items.sort((a, b) => rank(a) - rank(b) || a.productName.localeCompare(b.productName)));
    return list.sort((a, b) => {
      if (a.supplierName === NO_SUPPLIER) return 1;
      if (b.supplierName === NO_SUPPLIER) return -1;
      return a.supplierName.localeCompare(b.supplierName);
    });
  }, [rows]);

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

  const renderRow = (row: ReceivedRow) => {
    const draft = drafts[row.key];
    // Admin fills these in from the supplier's receipt.
    const editable = isManagement && !!draft && NEEDS_CHECK.includes(row.kind);
    const busy = savingKey === row.key;
    const setDraft = (patch: Partial<Draft>) => setDrafts(prev => ({ ...prev, [row.key]: { ...draft, ...patch } }));
    const draftDiff = editable && draft.bought !== "" ? row.received - (Number(draft.bought) || 0) : 0;

    return (
      <tr key={row.key} className={NEEDS_CHECK.includes(row.kind) ? "bg-amber-50/40" : "hover:bg-slate-50"}>
        <td className="p-3 font-medium text-slate-800">
          {row.productName}
          {editable && (
            <select
              className={`mt-2 block w-full max-w-[240px] border p-2 rounded-md bg-white text-sm font-normal ${!draft.supplierId ? "border-amber-400" : ""}`}
              value={draft.supplierId}
              onChange={e => setDraft({ supplierId: e.target.value })}
            >
              <option value="">-- Select supplier --</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </td>
        <td className="p-3 text-right font-bold">
          {editable ? (
            <input
              type="number"
              inputMode="numeric"
              min={1}
              className="w-20 border border-indigo-300 p-2 rounded-md text-right"
              value={draft.bought}
              onChange={e => setDraft({ bought: e.target.value })}
              title="Quantity on the supplier's receipt"
            />
          ) : row.bought === null ? <span className="text-slate-400 font-normal">—</span> : row.bought}
        </td>
        <td className="p-3 text-right font-bold">{row.received}</td>
        <td className="p-3">
          <StatusBadge row={row} />
          {draftDiff !== 0 && (
            <span className="block text-xs text-red-700 mt-1">
              {draftDiff > 0 ? `${draftDiff} more received than bought` : `${-draftDiff} not received`}
            </span>
          )}
        </td>
        {isManagement && (
          <td className="p-3 text-right text-slate-600">
            {editable ? (
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                className={`w-24 border p-2 rounded-md text-right ${!(Number(draft.unitCost) > 0) ? "border-amber-400" : ""}`}
                value={draft.unitCost}
                onChange={e => setDraft({ unitCost: e.target.value })}
                title="Unit price on the supplier's receipt"
              />
            ) : row.bought === null ? <span className="text-slate-400">—</span> : peso(row.unitCost)}
          </td>
        )}
        {isManagement && (
          <td className="p-3 text-right font-semibold">
            {editable
              ? peso((Number(draft.bought) || 0) * (Number(draft.unitCost) || 0))
              : row.bought === null ? <span className="text-slate-400 font-normal">—</span> : peso(row.bought * row.unitCost)}
          </td>
        )}
        <td className="p-3 text-xs text-slate-400 whitespace-nowrap">{format(new Date(row.at), "hh:mm a")}</td>
        {isManagement && (
          <td className="p-3 text-right">
            {editable && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => save(row)}
                disabled={busy || savingKey !== null || !(Number(draft.bought) >= 1) || (row.kind !== "auto" && !(Number(draft.unitCost) > 0))}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : row.kind === "auto" ? "Confirm" : "Record"}
              </Button>
            )}
          </td>
        )}
      </tr>
    );
  };

  const tableHead = (
    <thead>
      <tr className="text-slate-500 text-xs border-b bg-white">
        <th className="p-3 text-left font-medium">Product</th>
        <th className="p-3 text-right font-medium">Bought</th>
        <th className="p-3 text-right font-medium">Received</th>
        <th className="p-3 text-left font-medium">Result</th>
        {isManagement && <th className="p-3 text-right font-medium">Unit Cost</th>}
        {isManagement && <th className="p-3 text-right font-medium">Total</th>}
        <th className="p-3 text-left font-medium">Time</th>
        {isManagement && <th className="p-3" />}
      </tr>
    </thead>
  );

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
          Highlighted items were received without a purchase being entered first, so their quantity and price have not been checked against the supplier&apos;s receipt.
          {isManagement
            ? " Type the quantity and unit price from the receipt, then Confirm. Each supplier's total updates as you type, so you can match it to the receipt total before confirming."
            : " An admin needs to check them."}
        </p>
      )}

      {isManagement ? (
        groups.map(group => {
          // What the supplier total becomes once the values typed so far are
          // saved - the number to hold against the receipt before confirming.
          const typed = group.items.reduce((acc, r) => {
            const d = drafts[r.key];
            return NEEDS_CHECK.includes(r.kind) && d ? acc + (Number(d.bought) || 0) * (Number(d.unitCost) || 0) : acc;
          }, 0);
          return (
          <div key={group.supplierName} className="border rounded-md overflow-hidden">
            <div className="flex flex-wrap justify-between items-center gap-2 px-4 py-3 bg-slate-50 border-b">
              <p className="font-semibold text-slate-800">
                {group.supplierName}
                {group.toCheck > 0 && <span className="ml-2 text-xs font-medium text-amber-700">{group.toCheck} to check</span>}
              </p>
              <p className="text-sm text-slate-500" title="Bought quantity × unit cost for the purchases entered or confirmed so far">
                Checked: <span className="font-semibold text-slate-900">{peso(group.total)}</span>
                {group.toCheck > 0 && <>{" · "}with the values typed below: <span className="font-semibold text-amber-800">{peso(group.total + typed)}</span></>}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                {tableHead}
                <tbody className="divide-y">{group.items.map(renderRow)}</tbody>
              </table>
            </div>
          </div>
          );
        })
      ) : (
        // Staff view: supplier identities and costs are management-only.
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            {tableHead}
            <tbody className="divide-y">
              {[...rows].sort((a, b) => rank(a) - rank(b) || a.productName.localeCompare(b.productName)).map(renderRow)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
