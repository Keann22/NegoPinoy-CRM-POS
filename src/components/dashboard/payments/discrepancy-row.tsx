import Link from 'next/link';
import { ExternalLink, Copy, CheckCircle2, Eye, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DiscrepancyItem, ReconcileAction } from '@/types/payment-discrepancy.types';

// Colors are set for both the light and the dark theme so every label stays readable.
const BUTTONS: Record<ReconcileAction, { label: string; title: string; className: string }> = {
  overpayment_credit: {
    label: 'Credit',
    title: "Raise the payment; anything above the order total goes to the customer's store credit",
    className:
      'text-emerald-800 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-950/40',
  },
  tip: {
    label: 'Tip',
    title: 'Raise the payment and keep the extra as a tip',
    className:
      'text-amber-800 border-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-800 dark:hover:bg-amber-950/40',
  },
  split_payment: {
    label: 'Split',
    title: 'Link the orders that this one GCash transfer paid',
    className:
      'text-sky-800 border-sky-300 hover:bg-sky-50 dark:text-sky-300 dark:border-sky-800 dark:hover:bg-sky-950/40',
  },
  typo_correction: {
    label: 'Fix typo',
    title: 'Lower the payment to the GCash amount',
    className:
      'text-rose-800 border-rose-300 hover:bg-rose-50 dark:text-rose-300 dark:border-rose-800 dark:hover:bg-rose-950/40',
  },
  shipping_fee: {
    label: 'Shipping fee',
    title: "The extra was the shipping fee paid in advance (SPX): add it to the order's shipping fee, no store credit",
    className:
      'text-violet-800 border-violet-300 hover:bg-violet-50 dark:text-violet-300 dark:border-violet-800 dark:hover:bg-violet-950/40',
  },
  mark_checked: {
    label: '✓ Checked',
    title: 'No money change: use after fixing by hand, or when the recorded amount is right',
    className: 'text-foreground border-border hover:bg-muted',
  },
};

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

  return (
    <tr className="align-top hover:bg-muted/30">
      <td className="p-3 font-mono font-medium">
        <OrderLink orderId={item.orderId} shortId={item.orderShortId} />
      </td>
      <td className="p-3 font-medium">{item.customerName}</td>
      {isManagement && <td className="p-3 text-xs text-muted-foreground">{item.salesPerson}</td>}
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
        {item.others.length > 0 && (
          <div className="mt-1.5 rounded border border-sky-200 bg-sky-50 px-2 py-1 font-sans text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
            <div className="text-[11px] font-semibold">Same transfer also paid:</div>
            {item.others.map(o => (
              <div key={o.paymentId} className="flex items-center gap-1 text-[11px]">
                <OrderLink orderId={o.orderId} shortId={o.orderShortId} />
                <span>{peso(o.amount)}</span>
                {o.isReconciled && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
              </div>
            ))}
          </div>
        )}
      </td>
      <td className="p-3 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400">
        {peso(item.gcashAmount)}
      </td>
      <td className="p-3 text-right font-mono font-semibold">{peso(item.recordedAmount)}</td>
      <td className="p-3 text-center">
        <span
          className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-xs font-semibold ${
            variance < 0
              ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300'
              : 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300'
          }`}
        >
          {variance >= 0 ? '+' : '−'}
          {peso(Math.abs(variance))}
        </span>
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
          <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
          </span>
        ) : (
          <div className="flex max-w-[280px] flex-col gap-2">
            {item.blockedReason && (
              <p className="flex gap-1.5 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{item.blockedReason}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-1">
              {item.allowedActions.map(action => (
                <Button
                  key={action}
                  size="sm"
                  variant="outline"
                  className={`h-7 px-2.5 text-xs font-semibold ${BUTTONS[action].className}`}
                  title={BUTTONS[action].title}
                  disabled={isBusy}
                  onClick={() => onAction(item, action)}
                >
                  {BUTTONS[action].label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

function OrderLink({ orderId, shortId }: { orderId: string | null; shortId: string }) {
  if (!orderId) return <span>#{shortId}</span>;
  return (
    <Link
      href={`/dashboard/orders/${orderId}`}
      target="_blank"
      className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
      title="Open the order in a new tab"
    >
      #{shortId}
      <ExternalLink className="h-3 w-3" />
    </Link>
  );
}
