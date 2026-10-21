"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Info, OctagonX } from "lucide-react";
import type { OrderNoCheck } from "@/lib/services/online-order-tracking-service";

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Checks the typed order # against purchases already recorded. Several
 * products under one order # are fine (packed in one box); the same product
 * again under the same order # and tracking # is blocked.
 */
export function OrderNoCheckNotice({
  orderNo,
  trackingNo,
  productIds,
  onBlockedChange,
}: {
  orderNo: string;
  trackingNo: string;
  productIds: string[];
  onBlockedChange: (blocked: boolean) => void;
}) {
  const [check, setCheck] = useState<OrderNoCheck | null>(null);
  const idsKey = productIds.join(",");

  useEffect(() => {
    const no = orderNo.trim();
    if (!no || productIds.length === 0) {
      setCheck(null);
      onBlockedChange(false);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ orderNo: no, trackingNo: trackingNo.trim(), productIds: idsKey });
        const res = await fetch(`/api/inventory/procurement/order-check?${qs}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setCheck(data);
        onBlockedChange(data.conflicts.length > 0);
      } catch {
        // The server re-checks on save, so a failed lookup never lets a duplicate through.
        setCheck(null);
        onBlockedChange(false);
      }
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNo, trackingNo, idsKey]);

  if (!check || check.existing.length === 0) return null;

  if (check.conflicts.length > 0) {
    return (
      <div className="flex gap-2 rounded-md border-2 border-red-400 bg-red-50 px-3 py-2 text-xs text-red-800">
        <OctagonX className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <div className="font-bold">Already recorded — saving again would count it twice.</div>
          <ul className="mt-1 space-y-0.5">
            {check.conflicts.map((c, i) => (
              <li key={i}>
                {c.productName} ×{c.qty} · {fmtDay(c.orderedAt)}
                {c.trackingNo && <> · trk {c.trackingNo}</>}
              </li>
            ))}
          </ul>
          <div className="mt-1">Remove it here, or change the quantity on the existing order (Track) instead.</div>
        </div>
      </div>
    );
  }

  const others = check.existing.flatMap((e) => e.items);
  return (
    <div className="space-y-1">
      {check.warnings.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            Same item already in this order under a <b>different tracking #</b> (OK only if it was split into another box):{" "}
            {check.warnings.map((w) => `${w.productName} ×${w.qty} (trk ${w.trackingNo})`).join(", ")}
          </div>
        </div>
      )}
      <div className="flex gap-2 rounded-md border border-sky-200 bg-white px-3 py-2 text-xs text-slate-600">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-600" />
        <div>This order # already has: {others.map((o) => `${o.productName} ×${o.qty}`).join(", ")}.</div>
      </div>
    </div>
  );
}
