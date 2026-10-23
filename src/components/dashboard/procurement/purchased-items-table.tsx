"use client";

import React, { useState, useMemo } from 'react';
import { Truck, Search, X } from 'lucide-react';
import { daysSince, findStage, PHASE_LABELS, transitStatus, type TransitStatus } from '@/lib/online-order-tracking';
import { STATUS_STYLES } from './in-transit-chip';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const STATUS_ORDER: Record<TransitStatus, number> = { overdue: 0, delivered: 1, due_soon: 2, on_track: 3 };

/**
 * Bought but not yet received, one row per purchase (= one checkout). Online
 * orders show their shipment stage; any purchase can be opened to add or
 * update tracking.
 */
export function PurchasedItemsTable({
  items,
  suppliers = [],
  onOpenTracking,
  onOpenSearchDialog,
}: {
  items: any[];
  suppliers?: any[];
  onOpenTracking?: (poIds: string[], title: string) => void;
  onOpenSearchDialog?: () => void;
}) {
  const [filterQuery, setFilterQuery] = useState('');

  const byPo = useMemo(() => {
    const map = new Map<string, any[]>();
    items.forEach((it) => map.set(it.poId, [...(map.get(it.poId) || []), it]));
    return map;
  }, [items]);

  const orders = useMemo(() => {
    const list = Array.from(byPo.entries()).map(([poId, lines]) => {
      const first = lines[0];
      const status = first.trackingRoute
        ? transitStatus({ stage: first.trackingStage, expectedArrival: first.expectedArrival, orderedAt: first.orderedAt })
        : null;
      const supplierNames = Array.from(new Set(lines.map((l) => suppliers.find((s) => s.id === l.supplierId)?.name).filter(Boolean)));
      return { poId, lines, first, status, supplierNames };
    });

    // Tracked orders needing attention first, then the rest newest first.
    list.sort((a, b) => {
      const ra = a.status ? STATUS_ORDER[a.status] : 9;
      const rb = b.status ? STATUS_ORDER[b.status] : 9;
      if (ra !== rb) return ra - rb;
      return new Date(b.first.orderedAt).getTime() - new Date(a.first.orderedAt).getTime();
    });

    return list;
  }, [byPo, suppliers]);

  const filteredOrders = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return orders;

    return orders.filter(({ first, lines, supplierNames }) => {
      if (first.platformOrderNo && first.platformOrderNo.toLowerCase().includes(q)) return true;
      if (first.trackingNo && first.trackingNo.toLowerCase().includes(q)) return true;
      if (supplierNames.some((s: string) => s.toLowerCase().includes(q))) return true;
      return lines.some(
        (l) =>
          (l.productName && l.productName.toLowerCase().includes(q)) ||
          (l.supplierCode && l.supplierCode.toLowerCase().includes(q))
      );
    });
  }, [orders, filterQuery]);

  if (!items || items.length === 0) return null;

  const trackedCount = orders.filter((o) => o.status).length;

  return (
    <div className="border rounded-lg overflow-hidden shadow-sm mt-12 border-emerald-200">
      <div className="px-4 py-3 border-b bg-emerald-50 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-emerald-800">Purchased &amp; Expected to Receive</h2>
          <span className="text-emerald-600 text-xs sm:text-sm font-semibold">
            {orders.length} Orders · {items.length} Items
            {trackedCount > 0 && <> · {trackedCount} in transit</>}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick inline filter */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter order #, tracking #, product..."
              className="pl-8 pr-7 h-8 text-xs bg-white border-emerald-300 focus-visible:ring-emerald-500"
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {onOpenSearchDialog && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenSearchDialog}
              className="h-8 text-xs font-semibold border-emerald-300 text-emerald-800 hover:bg-emerald-100 flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5 text-emerald-600" />
              Search All
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[700px]">
          <thead>
            <tr className="bg-emerald-50/50 text-slate-500 text-sm border-b">
              <th className="p-3 text-left">Items</th>
              <th className="p-3 text-left">Shipment</th>
              <th className="p-3 text-right">Ordered</th>
              <th className="p-3 w-28"></th>
            </tr>
          </thead>
          <tbody className="divide-y text-slate-700">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-400 text-xs">
                  No orders match &quot;{filterQuery}&quot;.
                </td>
              </tr>
            ) : (
              filteredOrders.map(({ poId, lines, first, status, supplierNames }) => {
                const stage = findStage(first.trackingRoute, first.trackingStage);
                return (
                  <tr key={poId} className="hover:bg-slate-50 transition-colors align-top">
                    <td className="p-3">
                      {supplierNames.length > 0 && (
                        <div className="text-xs font-semibold text-slate-500 mb-1">{supplierNames.join(', ')}</div>
                      )}
                      <ul className="space-y-0.5">
                        {lines.map((it) => (
                          <li key={it.id}>
                            <span className="font-bold">{it.expectedQty - (it.receivedQty || 0)}x</span> {it.productName}
                            <span className="text-xs text-slate-500"> @ ₱{Number(it.unitCost || 0).toLocaleString('en-PH')}</span>
                            {it.receivedQty > 0 && <span className="text-xs text-slate-400"> ({it.receivedQty} received)</span>}
                            {it.supplierCode && <span className="text-xs text-slate-400 font-mono"> · {it.supplierCode}</span>}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="p-3">
                      {status && stage ? (
                        <div className="space-y-1">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>
                            {PHASE_LABELS[stage.phase]}
                          </span>
                          <div className="text-xs text-slate-600">{stage.label}</div>
                          {(first.platformOrderNo || first.trackingNo) && (
                            <div className="text-[11px] text-slate-400 font-mono">
                              {first.platformOrderNo && <>Order {first.platformOrderNo}</>}
                              {first.platformOrderNo && first.trackingNo && ' · '}
                              {first.trackingNo && <>Trk {first.trackingNo}</>}
                            </div>
                          )}
                          {first.expectedArrival && (
                            <div className="text-[11px] text-slate-400">Expected {first.expectedArrival}</div>
                          )}
                        </div>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-semibold">
                          {first.poNotes || 'Direct Purchase'}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right text-xs text-slate-500 whitespace-nowrap">
                      {new Date(first.orderedAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
                      <div className="text-slate-400">{daysSince(first.orderedAt)}d ago</div>
                    </td>
                    <td className="p-3 text-right">
                      {onOpenTracking && (
                        <button
                          onClick={() => onOpenTracking([poId], lines.length === 1 ? first.productName : `${lines.length} items`)}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${status ? 'border-sky-200 text-sky-700 hover:bg-sky-50' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                        >
                          <Truck className="w-3.5 h-3.5" /> {status ? 'Track' : 'Add tracking'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
