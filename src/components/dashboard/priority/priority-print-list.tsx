'use client';

import { STEP_LABELS, type PriorityRow } from '@/lib/priority/priority-rules';

/*
 * Printable copy of the Priority List as filtered on screen (owner, 2026-11-26):
 * e.g. Ready to pack → "OK to ship only", printed for the warehouse to tick off.
 * Hidden on screen; globals.css shows only .printable-area when printing.
 */

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PriorityPrintList({ items, title, filters }: {
  items: { row: PriorityRow; rank: number }[];
  title: string;
  /** Filters in use, e.g. ["OK to ship only", "Sales: Jan Marie Sabado"]. */
  filters: string[];
}) {
  return (
    <div className="printable-area hidden bg-white text-black print:block">
      <div className="mb-3">
        <h1 className="text-lg font-bold">Priority List: {title}</h1>
        <p className="text-xs">
          {items.length} order{items.length === 1 ? '' : 's'} · printed {when(new Date().toISOString())}
          {filters.length > 0 && <> · {filters.join(' · ')}</>}
        </p>
      </div>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="w-6 py-1 pr-1">✓</th>
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Order</th>
            <th className="py-1 pr-2">Customer</th>
            <th className="py-1 pr-2">Status</th>
            <th className="py-1 pr-2">Sales</th>
            <th className="py-1 pr-2">OK to ship</th>
            <th className="py-1 pr-2">Owes</th>
            <th className="py-1">Next step</th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ row, rank }) => (
            <tr key={row.id} className="break-inside-avoid border-b border-gray-400 align-top">
              <td className="py-1.5 pr-1"><span className="inline-block h-3.5 w-3.5 border border-black" /></td>
              <td className="py-1.5 pr-2 tabular-nums">{rank}</td>
              <td className="py-1.5 pr-2 font-mono font-semibold">#{row.id.slice(0, 7).toUpperCase()}</td>
              <td className="py-1.5 pr-2">{row.customerName || '—'}</td>
              <td className="py-1.5 pr-2">{row.status}</td>
              <td className="py-1.5 pr-2">{row.salesPersonName || '—'}</td>
              <td className="py-1.5 pr-2">{row.okToShip
                ? `${when(row.okToShip.at)}${row.okToShip.byName && row.okToShip.byName !== row.salesPersonName ? ` (${row.okToShip.byName})` : ''}`
                : ''}</td>
              <td className="py-1.5 pr-2 tabular-nums">{row.balanceDue > 0.009 ? `${peso(row.balanceDue)}${row.paymentMethod ? ` ${row.paymentMethod}` : ''}` : 'Paid'}</td>
              <td className="py-1.5">{STEP_LABELS[row.step]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
