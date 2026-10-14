"use client";

import { Truck } from "lucide-react";
import {
  defaultExpectedArrival,
  guessRouteForSupplier,
  ROUTE_LABELS,
  type TrackingRoute,
} from "@/lib/online-order-tracking";

export type OnlineOrderForm = {
  route: TrackingRoute | "";
  platformOrderNo: string;
  trackingNo: string;
  expectedArrival: string;
};

export const EMPTY_ONLINE_ORDER: OnlineOrderForm = { route: "", platformOrderNo: "", trackingNo: "", expectedArrival: "" };

/** Starting values for a buy from this supplier: tracking switched on for online platforms. */
export function onlineOrderFormFor(supplierName: string | null | undefined): OnlineOrderForm {
  const route = guessRouteForSupplier(supplierName);
  return route
    ? { ...EMPTY_ONLINE_ORDER, route, expectedArrival: defaultExpectedArrival(route) }
    : EMPTY_ONLINE_ORDER;
}

/** The `tracking` payload for POST /api/inventory/procurement, or null when not an online order. */
export function trackingPayload(form: OnlineOrderForm) {
  if (!form.route) return null;
  return {
    route: form.route,
    platformOrderNo: form.platformOrderNo,
    trackingNo: form.trackingNo,
    expectedArrival: form.expectedArrival,
    stage: "ordered",
  };
}

export function OnlineOrderFields({
  value,
  onChange,
}: {
  value: OnlineOrderForm;
  onChange: (next: OnlineOrderForm) => void;
}) {
  const setRoute = (route: TrackingRoute | "") =>
    onChange({
      ...value,
      route,
      expectedArrival: route ? (value.expectedArrival || defaultExpectedArrival(route)) : "",
    });

  return (
    <div className={`rounded-md border p-3 space-y-3 ${value.route ? "border-sky-200 bg-sky-50/50" : "border-slate-200"}`}>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 accent-sky-600"
          checked={!!value.route}
          onChange={(e) => setRoute(e.target.checked ? "china_import" : "")}
        />
        <Truck className="w-4 h-4 text-sky-600" />
        Online order — track shipment
      </label>

      {value.route && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Route</label>
            <select
              className="w-full border p-2 rounded-md bg-white text-sm"
              value={value.route}
              onChange={(e) => setRoute(e.target.value as TrackingRoute)}
            >
              {(Object.keys(ROUTE_LABELS) as TrackingRoute[]).map((r) => (
                <option key={r} value={r}>{ROUTE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Platform order #</label>
              <input
                className="w-full border p-2 rounded-md text-sm font-mono"
                value={value.platformOrderNo}
                onChange={(e) => onChange({ ...value, platformOrderNo: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Tracking #</label>
              <input
                className="w-full border p-2 rounded-md text-sm font-mono"
                value={value.trackingNo}
                onChange={(e) => onChange({ ...value, trackingNo: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Expected arrival</label>
            <input
              type="date"
              className="w-full border p-2 rounded-md text-sm"
              value={value.expectedArrival}
              onChange={(e) => onChange({ ...value, expectedArrival: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
