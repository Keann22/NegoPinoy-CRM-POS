'use client';

import Link from 'next/link';
import { PauseCircle, Users } from 'lucide-react';
import { phtToday, shortPhtDate } from '@/lib/shipping/ship-hold-rules';
import { cn } from '@/lib/utils';
import type { ShipHold, SiblingOrder } from '@/lib/services/order-ship-context-service';

/*
 * "Can this order ship yet?" shown wherever someone decides or is told to ship:
 * Priority List cards, Assign task, and the staff member's task card.
 * Found 2026-11-24: #020106B was held for the customer's other orders (₱3,352.90
 * still owed), but only Packed Orders showed the hold note.
 */

/** ₱3,352.90, or ₱2,000 for whole pesos. */
const peso = (n: number) => {
  const v = n || 0;
  const cents = Math.round(v * 100) % 100 !== 0;
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
};
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }).format(new Date(iso));

/**
 * Unpaid balance, COD included: a bus doesn't collect COD, so orders going
 * together by bus must be paid first (#3509BAD and #D911D94 are COD).
 */
export function owedOf(o: { balanceDue: number }): number {
  return o.balanceDue < 1 ? 0 : o.balanceDue;
}

const codTag = (method: string | null) => (method === 'COD' ? ' (COD)' : '');

function money(o: SiblingOrder): { text: string; owed: boolean } {
  if (o.balanceDue < 1) return { text: 'paid', owed: false };
  return { text: `${peso(o.balanceDue)} balance${codTag(o.paymentMethod)}`, owed: true };
}

interface Props {
  hold: ShipHold | null;
  others: SiblingOrder[];
  /** The order itself, to show what it still owes (cards that don't show it elsewhere). */
  self?: { balanceDue: number; paymentMethod: string | null } | null;
  /** Links open in the same tab unless told otherwise (task pop-ups close on navigate). */
  onNavigate?: () => void;
  className?: string;
}

export function ShipContextBlock({ hold, others, self, onNavigate, className }: Props) {
  const selfOwed = self ? owedOf(self) : 0;
  if (!hold && others.length === 0 && selfOwed === 0) return null;
  const owedTotal = others.reduce((s, o) => s + owedOf(o), 0);
  return (
    <div className={cn('space-y-1.5 text-xs', className)}>
      {selfOwed > 0 && (
        <div className="font-medium text-red-700 dark:text-red-300">This order: {peso(selfOwed)} balance unpaid{codTag(self?.paymentMethod ?? null)}</div>
      )}
      {hold && (
        <div className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
          <PauseCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-semibold">{hold.bus ? 'Marked for bus, not shipped yet' : 'Not for shipping yet'}:</span>{' '}
            &ldquo;{hold.reason}&rdquo;
            {(hold.byName || hold.at) && (
              <span className="opacity-80"> ({[hold.byName, hold.at && shortDate(hold.at)].filter(Boolean).join(', ')})</span>
            )}
            {hold.detail?.checkOn && (
              <span className="opacity-90">
                {' '}· ask again {shortPhtDate(hold.detail.checkOn)}
                {hold.detail.checkOn <= phtToday() && <span className="font-semibold text-red-700 dark:text-red-300"> (due now)</span>}
              </span>
            )}
          </span>
        </div>
      )}
      {others.length > 0 && (
        <div className="rounded-md border px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5 font-medium">
            <Users className="h-3.5 w-3.5" />
            Same customer: {others.length} other open order{others.length === 1 ? '' : 's'}
            {owedTotal > 0 && <span className="text-red-700 dark:text-red-300">· {peso(owedTotal)} balance unpaid</span>}
          </div>
          <ul className="mt-1 space-y-0.5">
            {others.map((o) => {
              const m = money(o);
              return (
                <li key={o.id} className="flex flex-wrap gap-x-1.5">
                  <Link href={`/dashboard/orders/${o.id}`} onClick={onNavigate} className="font-mono font-semibold text-primary hover:underline">{o.shortId}</Link>
                  <span className="text-muted-foreground">{o.status}</span>
                  <span className={cn(m.owed ? 'font-medium text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-400')}>· {m.text}</span>
                  {o.holdReason && <span className="text-muted-foreground">· held: &ldquo;{o.holdReason}&rdquo;</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
