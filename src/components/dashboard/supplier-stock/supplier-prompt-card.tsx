'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SUPPLIER_FLAG_HINTS, SUPPLIER_FLAG_LABELS, SUPPLIER_FLAG_BADGE } from '@/lib/supplier-stock/supplier-flag-rules';
import type { SupplierPrompt, SupplierPromptAnswer } from '@/types/supplier-stock.types';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const phTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** One order in the "out at the supplier" pop-up, with the answers that fit it. */
export function SupplierPromptCard({
  p, busy, onAnswer, onOpenOrder,
}: {
  p: SupplierPrompt;
  busy: boolean;
  onAnswer: (p: SupplierPrompt, a: SupplierPromptAnswer) => void;
  /** Records "changing" and opens Edit Order (or the order page for a cancel). */
  onOpenOrder: (p: SupplierPrompt, edit: boolean) => void;
}) {
  const money = p.kind === 'money_removed' || p.kind === 'money_cancelled';
  const spin = busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />;
  const ask = (
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAnswer(p, 'waiting_customer')}>Asked customer, waiting for reply</Button>
  );
  const change = (label = 'Change or remove the item') => (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => onOpenOrder(p, true)}>{label}</Button>
  );
  const cancel = <Button size="sm" variant="outline" disabled={busy} onClick={() => onOpenOrder(p, false)}>Cancel the order</Button>;

  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="space-y-0.5">
        <p className="font-medium leading-tight">
          {p.customerName}{' '}
          <Link href={`/dashboard/orders/${p.orderId}`} className="font-mono text-xs text-primary hover:underline">#{p.orderId.slice(0, 7).toUpperCase()}</Link>
          {p.paid > 0 && !money && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">Paid {peso(p.paid)}</span>}
        </p>
        <p className="text-sm break-words">{p.qty > 0 ? `${p.qty}× ` : ''}{p.productName}</p>
        <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${SUPPLIER_FLAG_BADGE[p.status]}`}>{SUPPLIER_FLAG_LABELS[p.status]}</span>
        {!money && <p className="text-xs text-muted-foreground">{SUPPLIER_FLAG_HINTS[p.status]}</p>}
        {p.altProductName && !money && <p className="text-sm">We can get: <span className="font-semibold">{p.altProductName}</span></p>}
        {p.newPrice != null && !money && <p className="text-sm">New price: <span className="font-semibold">{peso(p.newPrice)}</span></p>}
        {p.note && !money && <p className="text-sm break-words">“{p.note}”</p>}
        <p className="text-xs text-muted-foreground">
          {p.agent ? `Agent ${p.agent}` : 'No agent'}{p.waitingCustomerAt ? ` · asked the customer ${phTime(p.waitingCustomerAt)}` : ''}
        </p>
        {p.escalated && <p className="text-xs font-semibold text-red-700 dark:text-red-400">No answer for 3 days: owners, please decide.</p>}
        {p.kind === 'still_waiting' && <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">The customer said they&apos;d wait 2 weeks ago and it&apos;s still out. Is it still okay?</p>}
        {p.kind === 'money_removed' && <p className="pt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">The item was removed. {peso(p.amount)} they paid is in their store credit now.</p>}
        {p.kind === 'money_cancelled' && <p className="pt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">The order was cancelled. The customer paid {peso(p.amount)}.</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {p.kind === 'money_removed' && (
          <>
            <Button size="sm" disabled={busy} onClick={() => onAnswer(p, 'keep_credit')}>{spin}Keep as store credit</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAnswer(p, 'refund')}>Refund (owners told)</Button>
          </>
        )}
        {p.kind === 'money_cancelled' && (
          <>
            <Button size="sm" disabled={busy} onClick={() => onAnswer(p, 'credit_added')}>{spin}Put in store credit</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAnswer(p, 'refund')}>Refund (owners told)</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAnswer(p, 'handled')}>Already done</Button>
          </>
        )}
        {(p.kind === 'decide' || p.kind === 'still_waiting') && (
          <>
            {p.status === 'other_variant' && p.altProductName && change(p.altProductNames.length > 1 ? 'Switch to available color/size' : `Switch to ${p.altProductName}`)}
            {p.status === 'price_up' && (
              <Button size="sm" disabled={busy} onClick={() => onAnswer(p, 'wait')}>{spin}Customer agrees to the new price</Button>
            )}
            {(p.status === 'waiting_restock' || p.status === 'other_variant') && (
              <Button size="sm" disabled={busy} onClick={() => onAnswer(p, 'wait')}>
                {spin}{p.kind === 'still_waiting' ? 'Still waiting' : p.status === 'other_variant' ? 'Customer will wait for this one' : 'Customer will wait'}
              </Button>
            )}
            {change(p.status === 'other_variant' ? 'Change to another item / remove' : undefined)}
            {cancel}
            {ask}
          </>
        )}
      </div>
    </li>
  );
}
