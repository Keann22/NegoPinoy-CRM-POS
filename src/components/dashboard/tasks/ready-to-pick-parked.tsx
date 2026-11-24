'use client';

import Link from 'next/link';
import { CalendarClock, MessageCircleQuestion } from 'lucide-react';
import { shortPhtDate } from '@/lib/shipping/ship-hold-rules';
import type { ReadyToPickParked } from '@/types/ready-to-pick.types';

const phDate = (iso: string) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }).format(new Date(iso));

function Row({ o, children }: { o: ReadyToPickParked; children: React.ReactNode }) {
  return (
    <li className="space-y-0.5 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-2">
        <Link href={`/dashboard/orders/${o.id}`} target="_blank" className="font-mono font-semibold text-primary hover:underline">#{o.orderNo}</Link>
        <span>{o.customerName}</span>
        <span className="text-xs text-muted-foreground">{o.status}{o.salesPersonName ? ` · Sales: ${o.salesPersonName}` : ''}</span>
      </div>
      {children}
    </li>
  );
}

/**
 * Orders left off Ready to Pick for now (owner, 2026-11-25): they ship on a later
 * date (back on the list 3 days before), or the warehouse asked sales and is
 * waiting for the answer.
 */
export function ReadyToPickParkedLists({ shipLater, askedSales }: { shipLater: ReadyToPickParked[]; askedSales: ReadyToPickParked[] }) {
  if (shipLater.length === 0 && askedSales.length === 0) return null;
  return (
    <div className="space-y-3 pt-2">
      {askedSales.length > 0 && (
        <details open className="rounded-lg border border-amber-300 dark:border-amber-800">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <MessageCircleQuestion className="h-4 w-4" /> Hinihintay ang sagot ng sales ({askedSales.length})
          </summary>
          <ul className="divide-y border-t">
            {askedSales.map((o) => (
              <Row key={o.id} o={o}>
                <p className="text-xs">
                  {o.reasonLabel}{o.note ? `: “${o.note}”` : ''}
                  <span className="text-muted-foreground"> · {o.byName || 'Staff'}{o.at ? `, ${phDate(o.at)}` : ''}</span>
                </p>
              </Row>
            ))}
          </ul>
        </details>
      )}
      {shipLater.length > 0 && (
        <details className="rounded-lg border">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4" /> Ipapadala pa sa ibang petsa ({shipLater.length}): huwag munang i-pick
          </summary>
          <ul className="divide-y border-t">
            {shipLater.map((o) => (
              <Row key={o.id} o={o}>
                <p className="text-xs">
                  Ipadala sa <b>{o.shipOn ? shortPhtDate(o.shipOn) : '?'}</b>
                  {' · '}babalik dito sa {o.pickFrom ? shortPhtDate(o.pickFrom) : '?'}
                  {o.note ? <span className="text-muted-foreground"> · “{o.note}”</span> : null}
                </p>
              </Row>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
