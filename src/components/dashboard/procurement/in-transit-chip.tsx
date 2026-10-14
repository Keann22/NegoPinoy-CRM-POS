"use client";

import { Truck } from "lucide-react";
import { daysSince, transitStatus, worstStatus, type TransitStatus } from "@/lib/online-order-tracking";

export type InTransitShipment = {
  poId: string;
  qty: number;
  route: string;
  stage: string | null;
  stageAt: string | null;
  platformOrderNo: string | null;
  trackingNo: string | null;
  expectedArrival: string | null;
  orderedAt: string;
};

export const STATUS_STYLES: Record<TransitStatus, string> = {
  on_track: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100",
  due_soon: "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100",
  overdue: "bg-red-50 text-red-700 border-red-300 hover:bg-red-100",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100",
};

const STATUS_HINT: Record<TransitStatus, string> = {
  on_track: "On the way",
  due_soon: "Due within 3 days",
  overdue: "Overdue — past expected arrival (or 30+ days with no date)",
  delivered: "Delivered — receive it into stock",
};

/** "🚚 5 · 18d" under Need to Buy: units already ordered online and still on the way. */
export function InTransitChip({ shipments, onClick }: { shipments: InTransitShipment[]; onClick: () => void }) {
  if (!shipments || shipments.length === 0) return null;
  const qty = shipments.reduce((sum, s) => sum + s.qty, 0);
  const oldestDays = Math.max(...shipments.map((s) => daysSince(s.orderedAt)));
  const status = worstStatus(shipments.map((s) => transitStatus(s)));

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`${qty} unit(s) ordered online, ${shipments.length} shipment(s). ${STATUS_HINT[status]}. Click for tracking.`}
      className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap transition-colors ${STATUS_STYLES[status]}`}
    >
      <Truck className="w-3 h-3" />
      {qty} · {status === "delivered" ? "arrived" : `${oldestDays}d`}
    </button>
  );
}
