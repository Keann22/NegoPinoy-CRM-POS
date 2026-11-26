'use client';

import { PrintPortal } from '@/components/print-portal';
import type { ReadyToPickOrder } from '@/types/ready-to-pick.types';

const formatPrintedAt = (iso: string): string =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

const formatOrderDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: '2-digit',
  });

function paymentLabel(o: ReadyToPickOrder): string {
  if (o.paymentMethod === 'Lay-away' && o.isPaid) return 'Lay-away (Paid)';
  if (o.paymentMethod === 'Lay-away') return `Lay-away (${o.paidPercent}%)`;
  if (o.isPaid) return `${o.paymentMethod || 'Order'} (Paid)`;
  return o.paymentMethod || 'COD';
}

function compactNote(notes: string | null): string {
  if (!notes) return '';
  const collapsed = notes.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= 180) return collapsed;
  return `${collapsed.slice(0, 179)}…`;
}

export interface ReadyToPickPrintListProps {
  items: { order: ReadyToPickOrder; rank: number }[];
  tabLabel: string;
  filters: string[];
}

/**
 * Printable checklist of Ready to Pick orders (current tab + search/selection)
 * rendered through PrintPortal so the main page produces no blank pages.
 */
export function ReadyToPickPrintList({ items, tabLabel, filters }: ReadyToPickPrintListProps) {
  return (
    <PrintPortal>
      <div className="bg-white p-5 text-black">
        <div className="mb-3">
          <h1 className="text-lg font-bold">Ready to Pick: {tabLabel}</h1>
          <p className="text-xs">
            {items.length} order{items.length === 1 ? '' : 's'} · printed {formatPrintedAt(new Date().toISOString())}
            {filters.length > 0 && <> · {filters.join(' · ')}</>}
          </p>
        </div>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="w-6 py-1 pr-1">✓</th>
              <th className="w-7 py-1 pr-2">#</th>
              <th className="py-1 pr-2 whitespace-nowrap">Order</th>
              <th className="py-1 pr-2">Customer</th>
              <th className="py-1 pr-2">Payment / Sales</th>
              <th className="py-1">Items to Pick</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ order, rank }) => {
              const note = compactNote(order.notes);
              return (
                <tr key={order.id} className="break-inside-avoid border-b border-gray-400 align-top">
                  <td className="py-1.5 pr-1">
                    <span className="inline-block h-3.5 w-3.5 border border-black" />
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">{rank}</td>
                  <td className="py-1.5 pr-2">
                    <div className="font-mono font-semibold whitespace-nowrap">#{order.orderNo}</div>
                    <div className="text-[10px] text-gray-700 whitespace-nowrap">
                      {formatOrderDate(order.orderDate)}
                    </div>
                    {order.noOpenIssue && (
                      <div className="text-[10px] font-semibold">Re-pick to clear</div>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 font-medium">{order.customerName}</td>
                  <td className="py-1.5 pr-2">
                    <div>{paymentLabel(order)}</div>
                    {order.salesPersonName && (
                      <div className="text-[10px] text-gray-700">{order.salesPersonName}</div>
                    )}
                  </td>
                  <td className="py-1.5">
                    {order.items.length === 0 ? (
                      '—'
                    ) : (
                      <ul className="space-y-0.5">
                        {order.items.map((item) => (
                          <li key={item.productId} className="leading-snug">
                            <span className="font-mono font-semibold">{item.neededQty}×</span> {item.name}
                            <span className="text-[10px] text-gray-700">
                              {' '}
                              (Shelf: {item.shelfStock}
                              {item.shelfLocation ? ` · ${item.shelfLocation}` : ''})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {note && (
                      <div className="mt-1 text-[10px] italic text-gray-700">Note: {note}</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PrintPortal>
  );
}
