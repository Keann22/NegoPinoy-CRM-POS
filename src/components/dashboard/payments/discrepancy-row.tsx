import Link from 'next/link';
import { ExternalLink, Copy, CheckCircle2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { DiscrepancyItem, ReconcileAction } from '@/types/payment-discrepancy.types';

const BUTTONS: Record<ReconcileAction, { label: string; title: string; className: string }> = {
  overpayment_credit: {
    label: '🟢 Credit',
    title: "Raise the payment; anything above the order total goes to the customer's store credit",
    className: 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 border-emerald-800',
  },
  tip: {
    label: '🪙 Tip',
    title: 'Raise the payment and keep the extra as a tip',
    className: 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 border-amber-800',
  },
  split_payment: {
    label: '🔵 Split',
    title: 'Link the orders that this one GCash transfer paid',
    className: 'text-sky-400 hover:text-sky-300 hover:bg-sky-950/40 border-sky-800',
  },
  typo_correction: {
    label: '🔴 Fix Typo',
    title: 'Lower the payment to the GCash amount',
    className: 'text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border-rose-800',
  },
};

interface DiscrepancyRowProps {
  item: DiscrepancyItem;
  isManagement: boolean;
  isBusy: boolean;
  onCopyRef: (ref: string) => void;
  onPreviewImage: (url: string) => void;
  onAction: (item: DiscrepancyItem, action: ReconcileAction) => void;
}

export function DiscrepancyRow({
  item,
  isManagement,
  isBusy,
  onCopyRef,
  onPreviewImage,
  onAction,
}: DiscrepancyRowProps) {
  const variance = item.recordedAmount - item.gcashAmount;
  const isShared = item.others.length > 0;

  return (
    <tr className="hover:bg-muted/20">
      <td className="p-3 font-mono font-medium">
        <Link
          href={`/dashboard/orders/${item.orderId}`}
          target="_blank"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          #{item.orderShortId}
          <ExternalLink className="h-3 w-3" />
        </Link>
      </td>
      <td className="p-3 font-medium">{item.customerName}</td>
      {isManagement && (
        <td className="p-3 text-xs text-muted-foreground">{item.salesPerson}</td>
      )}
      <td className="p-3 font-mono text-xs">
        <div className="flex items-center gap-1">
          <span>{item.actualRef}</span>
          <button
            onClick={() => onCopyRef(item.actualRef)}
            className="text-muted-foreground hover:text-foreground"
            title="Copy reference"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
        {isShared && (
          <Badge variant="outline" className="mt-1 text-[10px] text-sky-400 border-sky-800 bg-sky-950/40">
            👥 {item.others.length + 1} Orders Share Ref
          </Badge>
        )}
      </td>
      <td className="p-3 text-right font-mono text-emerald-400 font-semibold">
        ₱{item.gcashAmount.toFixed(2)}
      </td>
      <td className="p-3 text-right font-mono font-semibold">
        ₱{item.recordedAmount.toFixed(2)}
      </td>
      <td className="p-3 text-center">
        <Badge
          variant="secondary"
          className={`font-mono text-xs ${
            variance < 0
              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              : 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
          }`}
        >
          {variance >= 0 ? '+' : ''}₱{variance.toFixed(2)}
        </Badge>
      </td>
      <td className="p-3">
        {item.proofUrl ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-primary"
            onClick={() => onPreviewImage(item.proofUrl!)}
          >
            <Eye className="h-3.5 w-3.5 mr-1" /> View
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
        )}
      </td>
      <td className="p-3">
        {item.isResolved ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded">
            <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
          </span>
        ) : item.allowedActions.length === 0 ? (
          <p className="text-xs text-amber-400 max-w-[260px]">
            {item.blockedReason || 'Check this order by hand.'}
          </p>
        ) : (
          <div className="flex gap-1 flex-wrap">
            {item.allowedActions.map(action => (
              <Button
                key={action}
                size="sm"
                variant="outline"
                className={`h-7 px-2 text-xs ${BUTTONS[action].className}`}
                title={BUTTONS[action].title}
                disabled={isBusy}
                onClick={() => onAction(item, action)}
              >
                {BUTTONS[action].label}
              </Button>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}
