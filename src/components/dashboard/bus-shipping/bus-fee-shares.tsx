'use client';

import { Input } from '@/components/ui/input';
import type { BusCandidateOrder, BusSfResult } from '@/types/bus-shipping.types';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  orders: BusCandidateOrder[];
  shares: Record<string, string>;
  onShareChange: (orderId: string, value: string) => void;
  fee: number;
  freeShipping: boolean;
  result: BusSfResult;
}

/** Each order's part of the trip fee (editable), and what the customer owes or sent extra. */
export function BusFeeShares({ orders, shares, onShareChange, fee, freeShipping, result }: Props) {
  const total = orders.reduce((s, o) => s + (Number(shares[o.id]) || 0), 0);
  const off = fee > 0 && Math.abs(total - fee) > 0.01;

  return (
    <div className="space-y-3">
      {orders.length > 1 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Fee per order</p>
          <p className="text-xs text-muted-foreground">
            Split by item value (orders where SF was sent in advance take it first). Change it if needed.
          </p>
          {orders.map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              <span className="w-24 shrink-0 font-mono text-sm">#{o.shortId}</span>
              <Input
                inputMode="decimal"
                className="h-10 text-base"
                value={shares[o.id] ?? ''}
                onChange={(e) => onShareChange(o.id, e.target.value)}
              />
            </div>
          ))}
          {off && <p className="text-sm text-destructive">The shares add up to {peso(total)}, not {peso(fee)}.</p>}
        </div>
      )}

      {fee > 0 && (
        <div className="rounded-md border p-3 text-sm space-y-1">
          {freeShipping ? (
            <p>Free shipping: the customer isn’t charged. The {peso(fee)} is only recorded as our expense.</p>
          ) : (
            <p>Customer is charged {peso(fee)} SF.</p>
          )}
          {result.advance > 0 && <p>They had paid {peso(result.advance)} above the items (SF sent in advance).</p>}
          {result.owed > 0.009 && (
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              Customer still owes {peso(result.owed)} SF. The sales agent will get a pop-up to collect it.
            </p>
          )}
          {result.extra > 0.009 && (
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">
              Customer sent {peso(result.extra)} more than the SF. The sales agent will decide: store credit, tip or refund.
            </p>
          )}
          {result.owed <= 0.009 && result.extra <= 0.009 && !freeShipping && result.advance > 0 && (
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">The SF they sent covers it exactly.</p>
          )}
        </div>
      )}
    </div>
  );
}
