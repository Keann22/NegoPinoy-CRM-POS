'use client';

import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { GcashTransferState } from '@/hooks/useGcashTransfer';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface TransferOrdersPickerProps {
  transfer: GcashTransferState;
  mainOrderId: string;
  /** The whole amount on the GCash screenshot. */
  gcashAmount: number;
}

/** Log Payment: tick the customer's orders this one GCash paid and set each order's share. */
export function TransferOrdersPicker({ transfer, mainOrderId, gcashAmount }: TransferOrdersPickerProps) {
  const { orders, picks, setPick, sharesTotal, isLoading, loadError } = transfer;
  const extra = Math.round((gcashAmount - sharesTotal) * 100) / 100;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading this customer&apos;s orders…
      </div>
    );
  }
  if (loadError) return <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{loadError}</p>;

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div>
        <p className="text-sm font-semibold">Orders this GCash paid</p>
        <p className="text-[11px] text-muted-foreground">
          Tick each order. The amount is filled in for you (lay-away: the usual installment; others: the balance).
          Change it to what the customer said.
        </p>
      </div>

      {orders.length <= 1 && (
        <p className="text-xs text-muted-foreground">This customer has no other orders with a balance.</p>
      )}

      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {orders.map((o) => {
          const pick = picks[o.id];
          const isMain = o.id === mainOrderId;
          return (
            <div key={o.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-primary"
                checked={!!pick?.on}
                disabled={isMain}
                onChange={(e) => setPick(o.id, { on: e.target.checked })}
                aria-label={`Include order #${o.shortId}`}
              />
              <div className="min-w-0 flex-1 text-xs">
                <div className="font-mono font-semibold">
                  #{o.shortId} {isMain && <span className="font-sans font-normal text-muted-foreground">(this order)</span>}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {o.isLayaway && o.monthlyPayment ? `Installment ${peso(o.monthlyPayment)}/month · ` : ''}
                  {o.isLayaway && !o.monthlyPayment && o.lastPayment ? `Lay-away, last paid ${peso(o.lastPayment)} · ` : ''}
                  Balance {peso(o.balanceDue)} · {o.status}
                </div>
              </div>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                className="h-8 w-28 text-right text-xs"
                value={pick?.amount ?? ''}
                disabled={!pick?.on}
                onChange={(e) => setPick(o.id, { amount: e.target.value })}
                aria-label={`Amount for order #${o.shortId}`}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t pt-2 text-xs">
        <span>Orders total <b>{peso(sharesTotal)}</b> of {peso(gcashAmount)} GCash</span>
      </div>
      {extra < -0.009 && (
        <p className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {peso(-extra)} more than the GCash amount. Lower an order&apos;s amount.
        </p>
      )}
      {extra > 0.009 && (
        <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {peso(extra)} of the GCash isn&apos;t on an order yet. It will go to the customer&apos;s store credit
          (or tick Tip), but only if this order is paid in full.
        </p>
      )}
      {Math.abs(extra) <= 0.009 && sharesTotal > 0 && (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">✓ Adds up to the GCash amount.</p>
      )}
    </div>
  );
}
