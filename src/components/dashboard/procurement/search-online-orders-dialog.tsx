"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOnlineOrderSearch } from "@/hooks/useOnlineOrderSearch";
import { STATUS_STYLES } from "./in-transit-chip";
import { findStage, PHASE_LABELS, transitStatus } from "@/lib/online-order-tracking";
import type { OnlineOrderSearchResult } from "@/types";
import {
  Search,
  Truck,
  Copy,
  Check,
  X,
  Package,
  Calendar,
  AlertCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

export function SearchOnlineOrdersDialog({
  open,
  onOpenChange,
  onOpenTracking,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTracking?: (poIds: string[], title: string) => void;
}) {
  const {
    query,
    setQuery,
    platform,
    setPlatform,
    status,
    setStatus,
    orders,
    loading,
    error,
    refresh,
    clear,
  } = useOnlineOrderSearch(open);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-sky-100 text-sky-700">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-slate-800">
                Search Online Orders
              </DialogTitle>
              <DialogDescription className="text-slate-600 text-xs sm:text-sm">
                Search Shopee and Pinduoduo purchases by order number, tracking number, or product name.
              </DialogDescription>
            </div>
          </div>

          {/* Search bar & quick filters */}
          <div className="mt-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search order number (e.g. 261017-...), tracking number, or product..."
                className="pl-9 pr-9 h-10 text-sm bg-white border-slate-300 focus-visible:ring-sky-500 shadow-sm"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              {/* Platform buttons */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium mr-1">Platform:</span>
                <Button
                  type="button"
                  size="sm"
                  variant={platform === "all" ? "default" : "outline"}
                  onClick={() => setPlatform("all")}
                  className={`h-7 px-2.5 text-xs rounded-full ${platform === "all" ? "bg-slate-800 hover:bg-slate-700 text-white" : ""}`}
                >
                  All
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={platform === "pinduoduo" ? "default" : "outline"}
                  onClick={() => setPlatform("pinduoduo")}
                  className={`h-7 px-2.5 text-xs rounded-full border-rose-200 text-rose-700 hover:bg-rose-50 ${platform === "pinduoduo" ? "bg-rose-600 hover:bg-rose-700 text-white border-transparent" : ""}`}
                >
                  Pinduoduo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={platform === "shopee" ? "default" : "outline"}
                  onClick={() => setPlatform("shopee")}
                  className={`h-7 px-2.5 text-xs rounded-full border-orange-200 text-orange-700 hover:bg-orange-50 ${platform === "shopee" ? "bg-orange-600 hover:bg-orange-700 text-white border-transparent" : ""}`}
                >
                  Shopee
                </Button>
              </div>

              {/* Status buttons */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium mr-1">Status:</span>
                <Button
                  type="button"
                  size="sm"
                  variant={status === "all" ? "default" : "outline"}
                  onClick={() => setStatus("all")}
                  className={`h-7 px-2.5 text-xs rounded-full ${status === "all" ? "bg-slate-800 hover:bg-slate-700 text-white" : ""}`}
                >
                  All
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={status === "pending" ? "default" : "outline"}
                  onClick={() => setStatus("pending")}
                  className={`h-7 px-2.5 text-xs rounded-full border-sky-200 text-sky-700 hover:bg-sky-50 ${status === "pending" ? "bg-sky-600 hover:bg-sky-700 text-white border-transparent" : ""}`}
                >
                  Pending / In Transit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={status === "received" ? "default" : "outline"}
                  onClick={() => setStatus("received")}
                  className={`h-7 px-2.5 text-xs rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 ${status === "received" ? "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent" : ""}`}
                >
                  Received
                </Button>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
              <p className="text-sm">Searching orders...</p>
            </div>
          )}

          {!loading && error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
              <Button size="sm" variant="outline" onClick={refresh}>
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && orders.length === 0 && (
            <div className="py-16 text-center space-y-3">
              <Package className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="text-slate-600 font-semibold">No orders found</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {query
                  ? `No orders matching "${query}". Try searching by a partial order number, tracking number, or product name.`
                  : "No online orders found matching the selected filters."}
              </p>
              {query && (
                <Button size="sm" variant="outline" onClick={clear}>
                  Clear Filters
                </Button>
              )}
            </div>
          )}

          {!loading && !error && orders.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 font-medium">
                {query
                  ? `Found ${orders.length} matching order${orders.length === 1 ? "" : "s"}`
                  : `Showing ${orders.length} recent order${orders.length === 1 ? "" : "s"}`}
              </div>

              {orders.map((order) => {
                const stage = findStage(
                  order.trackingRoute as any,
                  order.trackingStage
                );
                const transitStat = order.trackingRoute
                  ? transitStatus({
                      stage: order.trackingStage,
                      expectedArrival: order.expectedArrival,
                      orderedAt: order.createdAt,
                    })
                  : null;

                const firstItemName = order.items[0]?.productName || "Order items";
                const trackingTitle =
                  order.items.length === 1
                    ? firstItemName
                    : `${order.items.length} items (${firstItemName})`;

                return (
                  <div
                    key={order.id}
                    className="border rounded-xl p-4 bg-white hover:border-sky-300 transition-all shadow-sm space-y-3"
                  >
                    {/* Top Row: Platform, Status, Dates */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {order.platform === "Pinduoduo" ? (
                          <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-rose-200 font-bold">
                            Pinduoduo
                          </Badge>
                        ) : order.platform === "Shopee" ? (
                          <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200 font-bold">
                            Shopee
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-600 font-semibold">
                            {order.supplierName || "Online Order"}
                          </Badge>
                        )}

                        {order.status === "received" ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 font-semibold">
                            Received
                          </Badge>
                        ) : transitStat && stage ? (
                          <span
                            className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[transitStat]}`}
                          >
                            {PHASE_LABELS[stage.phase]} · {stage.label}
                          </span>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 font-semibold">
                            Pending Receipt
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Ordered {fmtDate(order.createdAt)}</span>
                        </div>
                        {order.expectedArrival && (
                          <div className="text-slate-600 font-medium">
                            Expected: <span className="text-slate-800">{fmtDate(order.expectedArrival)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Middle Row: Identifiers & Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 rounded-lg p-2.5 border border-slate-100">
                      <div className="flex flex-wrap items-center gap-4 text-xs">
                        {order.platformOrderNo ? (
                          <div className="flex items-center gap-1.5 font-mono">
                            <span className="text-slate-500 font-sans font-medium">Order #:</span>
                            <span className="font-semibold text-slate-800 select-all">
                              {order.platformOrderNo}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(order.platformOrderNo!, `ord-${order.id}`)
                              }
                              className="text-slate-400 hover:text-slate-600 p-0.5"
                              title="Copy Order Number"
                            >
                              {copiedKey === `ord-${order.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No Order #</span>
                        )}

                        {order.trackingNo ? (
                          <div className="flex items-center gap-1.5 font-mono">
                            <span className="text-slate-500 font-sans font-medium">Tracking #:</span>
                            <span className="font-semibold text-sky-800 select-all">
                              {order.trackingNo}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(order.trackingNo!, `trk-${order.id}`)
                              }
                              className="text-slate-400 hover:text-slate-600 p-0.5"
                              title="Copy Tracking Number"
                            >
                              {copiedKey === `trk-${order.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No Tracking #</span>
                        )}
                      </div>

                      {onOpenTracking && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            onOpenChange(false);
                            onOpenTracking([order.id], trackingTitle);
                          }}
                          className="h-7 px-2.5 text-xs border-sky-200 text-sky-700 hover:bg-sky-50 flex items-center gap-1.5"
                        >
                          <Truck className="w-3.5 h-3.5 text-sky-600" />
                          Track / Update Shipment
                        </Button>
                      )}
                    </div>

                    {/* Bottom Row: Product Lines */}
                    <div className="space-y-1 pt-1">
                      <div className="text-xs font-semibold text-slate-500">
                        Products ({order.items.length}):
                      </div>
                      <ul className="divide-y divide-slate-100 text-xs">
                        {order.items.map((item) => (
                          <li
                            key={item.id}
                            className="py-1.5 flex items-center justify-between gap-3 text-slate-700"
                          >
                            <div className="flex items-baseline gap-2">
                              <span className="font-bold text-slate-900">
                                {item.expectedQty}x
                              </span>
                              <span className="font-medium text-slate-800">
                                {item.productName}
                              </span>
                              {item.receivedQty > 0 && (
                                <span className="text-emerald-700 font-semibold text-[11px] bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                  {item.receivedQty} received
                                </span>
                              )}
                            </div>
                            <div className="text-slate-500 font-mono text-right flex-shrink-0">
                              ₱{Number(item.unitCost || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
