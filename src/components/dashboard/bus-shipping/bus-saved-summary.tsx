'use client';

import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BusCandidateOrder, SaveBusShipmentResult } from '@/types/bus-shipping.types';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** After a bus fee is saved: what happened, and what sales will be asked. */
export function BusSavedSummary({ result, orders, onNext }: {
  result: SaveBusShipmentResult;
  orders: BusCandidateOrder[];
  onNext: () => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
      <p className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
        <CheckCircle2 className="h-5 w-5" /> Saved. {orders.length} order{orders.length === 1 ? '' : 's'} marked Shipped.
      </p>
      <p>Tracking: {result.trackingText}</p>
      {result.creditUsed > 0 && <p>{peso(result.creditUsed)} of their store credit (the SF they sent) was used for the fee.</p>}
      {result.owed > 0.009 && <p className="font-semibold">Customer still owes {peso(result.owed)} SF. The sales agent was asked to collect it.</p>}
      {result.extra > 0.009 && <p className="font-semibold">Customer sent {peso(result.extra)} extra. The sales agent will decide what to do with it.</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        {orders.map((o) => (
          <Link key={o.id} href={`/dashboard/orders/${o.id}`} className="font-mono text-primary hover:underline">#{o.shortId}</Link>
        ))}
      </div>
      <Button onClick={onNext} className="w-full">Back to Waiting for bus</Button>
    </div>
  );
}
