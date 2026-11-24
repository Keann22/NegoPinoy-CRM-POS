'use client';

import Link from 'next/link';
import { CheckCircle2, Clock } from 'lucide-react';
import type { ShipHoldOrder } from '@/types/ship-holds.types';

/** The orders of a hold group: ready (packed and paid enough) or what each still waits for. */
export function ShipHoldOrdersList({ orders }: { orders: ShipHoldOrder[] }) {
  if (orders.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-xs">
      {orders.map((o) => (
        <li key={o.id} className="flex flex-wrap items-center gap-x-1.5">
          {o.ready
            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            : <Clock className="h-3.5 w-3.5 text-amber-600" />}
          <Link href={`/dashboard/orders/${o.id}`} className="font-mono font-semibold text-primary hover:underline">{o.shortId}</Link>
          <span className="text-muted-foreground">{o.status}</span>
          <span className={o.ready ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-800 dark:text-amber-300'}>
            · {o.ready ? 'ready' : o.waitingFor}
          </span>
        </li>
      ))}
    </ul>
  );
}
