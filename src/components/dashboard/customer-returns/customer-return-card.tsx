'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CR_DAMAGED_ACTION_LABELS,
  CR_OUTCOME_LABELS,
  CR_OUTCOME_TODO,
  CR_SOURCE_LABELS,
  CR_STAGE_LABELS,
  type CustomerReturn,
  type CustomerReturnAction,
} from '@/types/customer-returns.types';

export type CustomerReturnDialogKind = 'decide' | 'check' | 'done' | 'replacement' | 'money';

const EVENT_LABELS: Record<string, string> = {
  opened: 'Opened',
  decided: 'Owner decided',
  arrived: 'Parcel arrived',
  checked: 'Checked',
  restocked: 'Good pieces back on shelf',
  throw_away: 'Damaged: thrown away',
  second_hand: 'Damaged: keep for 2nd-hand',
  outcome_done: 'Done',
  replacement_order: 'Replacement order made',
  refund_sent: 'Refund sent',
  credit_given: 'Store credit given',
  photos: 'Photos added',
  closed: 'Closed',
  cancelled: 'Case cancelled',
};

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const phDate = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

interface Props {
  ret: CustomerReturn;
  isManagement: boolean;
  onDialog: (kind: CustomerReturnDialogKind, ret: CustomerReturn) => void;
  onAct: (action: CustomerReturnAction) => Promise<void>;
}

export function CustomerReturnCard({ ret, isManagement, onDialog, onAct }: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = ret.status === 'open';
  const todo = ret.outcome ? CR_OUTCOME_TODO[ret.outcome] : null;
  const damagedTotal = ret.items.reduce((s, i) => s + i.damagedQty, 0);
  const canChangeDecision = open && !ret.outcomeDoneAt && !ret.restockedAt && !ret.replacementOrderId;
  // Which dialog carries out the decided outcome.
  const todoDialog: CustomerReturnDialogKind = ret.outcome === 'replacement' ? 'replacement' : ret.outcome === 'reship' ? 'done' : 'money';
  const canReplaceDamaged = open && ret.outcome === 'reship' && !!ret.checkedAt && damagedTotal > 0 && !ret.replacementOrderId;

  const run = async (action: CustomerReturnAction) => {
    setBusy(true);
    try { await onAct(action); } catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${ret.isOverdue ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20' : 'bg-card'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium leading-tight break-words">
            #{ret.caseNo} · {ret.customerName}{' '}
            <Link href={`/dashboard/orders/${ret.orderId}`} className="text-xs font-mono text-primary hover:underline">
              order #{ret.orderId.slice(0, 7).toUpperCase()}
            </Link>
          </p>
          <p className="text-xs text-muted-foreground">
            {CR_SOURCE_LABELS[ret.source]} · {ret.reason}{ret.salesPersonName ? ` · agent ${ret.salesPersonName}` : ''}
          </p>
        </div>
        <Badge variant={ret.isOverdue ? 'destructive' : ret.stage === 'done' ? 'outline' : 'secondary'}>
          {CR_STAGE_LABELS[ret.stage]} · {ret.daysOpen}d{ret.isOverdue ? ' · late' : ''}
        </Badge>
      </div>

      <ul className="space-y-0.5 text-sm">
        {ret.items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-x-2">
            <span>{i.qty}× {i.productName}</span>
            {ret.checkedAt && i.goodQty > 0 && <span className="text-xs text-emerald-700">{i.goodQty} good</span>}
            {i.damagedQty > 0 && i.damagedAction !== 'never_came_back' && <span className="text-xs text-red-700">{i.damagedQty} damaged</span>}
            {i.damagedAction && <span className="text-xs text-muted-foreground">({CR_DAMAGED_ACTION_LABELS[i.damagedAction]})</span>}
            {open && isManagement && ret.checkedAt && i.damagedQty > 0 && !i.damagedAction && (
              <span className="flex gap-1">
                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={busy}
                  onClick={() => run({ action: 'damaged_action', id: ret.id, itemId: i.id, damagedAction: 'throw_away' })}>Throw away</Button>
                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={busy}
                  onClick={() => run({ action: 'damaged_action', id: ret.id, itemId: i.id, damagedAction: 'second_hand' })}>Sell 2nd-hand</Button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {ret.outcome && (
        <p className="text-xs">
          <span className="font-medium">{CR_OUTCOME_LABELS[ret.outcome]}</span>
          {ret.amount > 0 && ` · ${peso(ret.amount)}`}
          {ret.source === 'damage_report' && (ret.askBack ? ' · asked to ship it back' : ' · not asking for it back')}
          {ret.courierClaim && ' · claim from courier'}
          {ret.outcome === 'replacement' && ret.shippingPayer && (ret.shippingPayer === 'us' ? ' · free shipping' : ' · customer pays shipping')}
          {ret.decisionNote && <span className="italic text-muted-foreground"> · “{ret.decisionNote}”</span>}
        </p>
      )}
      {(ret.replacementOrderId || ret.refundMethod || ret.creditGiven > 0) && (
        <p className="text-xs text-emerald-700">
          {ret.replacementOrderId && (
            <>Replacement order{' '}
              <Link href={`/dashboard/orders/${ret.replacementOrderId}`} className="font-mono underline">
                #{ret.replacementOrderId.slice(0, 7).toUpperCase()}
              </Link>
            </>
          )}
          {ret.refundMethod && `Refunded ${peso(ret.amount)} by ${ret.refundMethod}${ret.refundReference ? ` (ref ${ret.refundReference})` : ''}`}
          {ret.creditGiven > 0 && `${peso(ret.creditGiven)} store credit given`}
        </p>
      )}
      {ret.notes && <p className="text-xs text-muted-foreground italic">“{ret.notes}”</p>}
      {open && ret.outcome === 'reship' && damagedTotal > 0 && (
        <p className="text-xs text-red-700">
          {damagedTotal} damaged piece(s) can&apos;t be re-shipped.{ret.replacementOrderId ? ' A replacement order was made for them.' : ' Make a replacement order for them.'}
        </p>
      )}

      {ret.photoUrls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ret.photoUrls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="block h-12 w-12 overflow-hidden rounded border">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote storage URL, small thumbnail */}
              <img src={u} alt="Damage" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {open && isManagement && canChangeDecision && (
          <Button size="sm" variant={ret.decidedAt ? 'outline' : 'default'} onClick={() => onDialog('decide', ret)}>
            {ret.decidedAt ? 'Change decision' : 'Decide'}
          </Button>
        )}
        {open && !isManagement && !ret.decidedAt && <span className="text-xs text-muted-foreground">Waiting for the owners to decide.</span>}
        {open && ret.askBack && !ret.arrivedAt && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ action: 'arrived', id: ret.id })}>Parcel arrived</Button>
        )}
        {open && ret.askBack && !ret.checkedAt && (
          <Button size="sm" variant={ret.stage === 'to_check' ? 'default' : 'outline'} onClick={() => onDialog('check', ret)}>Check pieces</Button>
        )}
        {open && ret.stage === 'to_do' && todo && (todo.ownerOnly && !isManagement
          ? <span className="text-xs text-muted-foreground">Waiting for the owners: {todo.label.toLowerCase()}.</span>
          : <Button size="sm" onClick={() => onDialog(todoDialog, ret)}>{todo.label}</Button>)}
        {canReplaceDamaged && (
          <Button size="sm" variant="outline" onClick={() => onDialog('replacement', ret)}>Replacement order for damaged</Button>
        )}
        {open && isManagement && canChangeDecision && (
          <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" disabled={busy}
            onClick={() => { if (confirm('Cancel this case? Use this only if it was opened by mistake.')) run({ action: 'cancel_case', id: ret.id }); }}>
            Opened by mistake
          </Button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto text-xs" onClick={() => setShowHistory((s) => !s)}>
          History {showHistory ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
        </Button>
      </div>

      {showHistory && (
        <ul className="border-t pt-2 space-y-1 text-xs">
          {ret.events.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-2">
              <span className="text-muted-foreground">{phDate(e.createdAt)}</span>
              <span className="font-medium">{EVENT_LABELS[e.event] || e.event}</span>
              {e.actorName && <span className="text-muted-foreground">by {e.actorName}</span>}
              {e.note && <span className="italic text-muted-foreground">“{e.note}”</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
