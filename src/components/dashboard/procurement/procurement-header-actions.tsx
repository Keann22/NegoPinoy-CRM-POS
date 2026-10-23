"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, RefreshCw, Receipt, ClipboardList, Truck, Search } from "lucide-react";

interface ProcurementHeaderActionsProps {
  onRefresh: () => void;
  refreshing: boolean;
  onOpenSavedScans: () => void;
  draftsCount: number;
  onOpenTodaysPurchases: () => void;
  toCheckCount: number;
  onOpenSearchOrders: () => void;
  onOpenOnlineOrder: () => void;
  onOpenAddMissingItem: () => void;
}

export function ProcurementHeaderActions({
  onRefresh,
  refreshing,
  onOpenSavedScans,
  draftsCount,
  onOpenTodaysPurchases,
  toCheckCount,
  onOpenSearchOrders,
  onOpenOnlineOrder,
  onOpenAddMissingItem,
}: ProcurementHeaderActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={onOpenTodaysPurchases}
        variant="outline"
        className="font-bold px-4 py-2 flex items-center justify-center gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
      >
        <ClipboardList className="w-4 h-4 text-emerald-600" />
        Today's Purchases
        {toCheckCount > 0 && (
          <Badge
            className="bg-amber-500 hover:bg-amber-600 text-white text-[11px] px-1.5 py-0 h-5 font-bold"
            title={`${toCheckCount} item${toCheckCount === 1 ? '' : 's'} received today need a purchase entered`}
          >
            {toCheckCount} to check
          </Badge>
        )}
      </Button>
      <Button
        onClick={onOpenSavedScans}
        variant="outline"
        className="font-bold px-4 py-2 flex items-center justify-center gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
      >
        <Receipt className="w-4 h-4 text-indigo-600" />
        Saved Scans
        {draftsCount > 0 && (
          <Badge className="bg-indigo-600 text-white hover:bg-indigo-600 text-xs px-1.5 py-0 min-w-[20px] h-5 flex items-center justify-center rounded-full">
            {draftsCount}
          </Badge>
        )}
      </Button>
      <Button
        onClick={onRefresh}
        disabled={refreshing}
        variant="outline"
        className="font-bold px-4 py-2 flex items-center justify-center gap-2"
      >
        <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        {refreshing ? "Refreshing..." : "Refresh"}
      </Button>
      <Button
        onClick={onOpenSearchOrders}
        variant="outline"
        className="font-bold px-4 py-2 flex items-center justify-center gap-2 border-sky-300 text-sky-800 bg-sky-50/60 hover:bg-sky-100"
      >
        <Search className="w-4 h-4 text-sky-600" /> Search Online Orders
      </Button>
      <Button
        onClick={onOpenOnlineOrder}
        className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 flex items-center justify-center gap-2"
      >
        <Truck className="w-5 h-5" /> Record Online Order
      </Button>
      <Button
        onClick={onOpenAddMissingItem}
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 flex items-center justify-center gap-2"
      >
        <PlusCircle className="w-5 h-5" /> Add Missing Item
      </Button>
    </div>
  );
}
