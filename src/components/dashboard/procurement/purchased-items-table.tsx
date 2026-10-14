import React from 'react';
import { Truck } from 'lucide-react';
import { daysSince, findStage, PHASE_LABELS, transitStatus, type TransitStatus } from '@/lib/online-order-tracking';
import { STATUS_STYLES } from './in-transit-chip';

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
}: {
  items: any[];
  suppliers?: any[];
  onOpenTracking?: (poIds: string[], title: string) => void;
}) {
  if (!items || items.length === 0) return null;

  const byPo = new Map<string, any[]>();
  items.forEach((it) => byPo.set(it.poId, [...(byPo.get(it.poId) || []), it]));

  const orders = Array.from(byPo.entries()).map(([poId, lines]) => {
    const first = lines[0];
    const status = first.trackingRoute
      ? transitStatus({ stage: first.trackingStage, expectedArrival: first.expectedArrival, orderedAt: first.orderedAt })
      : null;
    const supplierNames = Array.from(new Set(lines.map((l) => suppliers.find((s) => s.id === l.supplierId)?.name).filter(Boolean)));
    return { poId, lines, first, status, supplierNames };
  });

  // Tracked orders needing attention first, then the rest newest first.
  orders.sort((a, b) => {
    const ra = a.status ? STATUS_ORDER[a.status] : 9;
    const rb = b.status ? STATUS_ORDER[b.status] : 9;
    if (ra !== rb) return ra - rb;
    return new Date(b.first.orderedAt).getTime() - new Date(a.first.orderedAt).getTime();
  });

  const trackedCount = orders.filter((o) => o.status).length;

  return (
    <div className="border rounded-lg overflow-hidden shadow-sm mt-12 border-emerald-200">
      <div className="px-4 py-3 border-b bg-emerald-50 flex justify-between items-center gap-2">
        <h2 className="text-xl font-bold text-emerald-800">Purchased & Expected to Receive</h2>
        <span className="text-emerald-600 text-sm font-semibold text-right">
          {orders.length} Orders · {items.length} Items
          {trackedCount > 0 && <> · {trackedCount} in transit</>}
        </span>
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
            {orders.map(({ poId, lines, first, status, supplierNames }) => {
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
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
