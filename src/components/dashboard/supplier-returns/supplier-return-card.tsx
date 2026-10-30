'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FOUND_AT_LABELS, OUTCOME_LABELS, type SupplierReturn } from '@/types/supplier-returns.types';
import type { ReturnDialogKind } from './return-action-dialog';

const EVENT_LABELS: Record<string, string> = {
  reported: 'Set aside',
  handed_back: 'Handed back to supplier',
  replacement: 'Replacement arrived',
  ...OUTCOME_LABELS,
};

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const phDate = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

interface Props {
  ret: SupplierReturn;
  isManagement: boolean;
  onAction: (kind: ReturnDialogKind, ret: SupplierReturn) => void;
}

export function SupplierReturnCard({ ret, isManagement, onAction }: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const open = ret.status !== 'closed';

  const waitingText =
    ret.status === 'to_return' ? `Set aside ${ret.daysWaiting} day(s) ago`
    : ret.status === 'with_supplier' ? `With supplier ${ret.daysWaiting} of ${ret.limitDays} day(s)`
    : ret.outcome ? OUTCOME_LABELS[ret.outcome] : 'Closed';

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${ret.isOverdue ? 'border-red-300 bg-red-50/50' : 'bg-card'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium leading-tight break-words">{ret.productName}</p>
          <p className="text-xs text-muted-foreground">
            #{ret.returnNo} · {ret.reason} · {FOUND_AT_LABELS[ret.foundAt]}{ret.sku ? ` · ${ret.sku}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold leading-none">{open ? ret.openQty : ret.qty} pc{(open ? ret.openQty : ret.qty) === 1 ? '' : 's'}</p>
          {ret.replacedQty > 0 && <p className="text-[11px] text-emerald-700">{ret.replacedQty} replaced</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Badge variant={ret.isOverdue ? 'destructive' : 'secondary'}>{ret.isOverdue ? `Overdue · ${waitingText}` : waitingText}</Badge>
        {ret.customerWaiting && <Badge className="bg-amber-500 hover:bg-amber-500">Customer waiting</Badge>}
        {isManagement && (
          <span className="text-muted-foreground">
            {ret.supplierName || 'Supplier not set'}
            {ret.owedAmount != null && open ? ` · owed ${peso(ret.owedAmount)}` : ''}
            {!open && ret.refundAmount ? ` · refund ${peso(ret.refundAmount)}` : ''}
          </span>
        )}
      </div>

      {ret.notes && <p className="text-xs text-muted-foreground italic">“{ret.notes}”</p>}

      <div className="flex flex-wrap items-center gap-2">
        {open && isManagement && ret.status === 'to_return' && (
          <Button size="sm" onClick={() => onAction('hand_back', ret)}>Handed back</Button>
        )}
        {open && (
          <Button size="sm" variant={ret.status === 'with_supplier' ? 'default' : 'outline'} onClick={() => onAction('replacement', ret)}>
            Replacement arrived
          </Button>
        )}
        {open && isManagement && (
          <Button size="sm" variant="outline" onClick={() => onAction('close', ret)}>Refund / close</Button>
        )}
        {open && isManagement && ret.status === 'to_return' && (
          <Button size="sm" variant="ghost" onClick={() => onAction('cancel', ret)}>Not returning</Button>
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
              {e.qty != null && <span>{e.qty} pc(s)</span>}
              {isManagement && !!e.amount && <span>{peso(e.amount)}</span>}
              {e.actorName && <span className="text-muted-foreground">by {e.actorName}</span>}
              {e.note && <span className="italic text-muted-foreground">“{e.note}”</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
