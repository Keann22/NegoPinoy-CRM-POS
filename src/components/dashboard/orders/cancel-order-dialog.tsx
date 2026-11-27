'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, PackageOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRoleCheck } from '@/hooks/useRoleCheck';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/lib/supabase/hooks';
import { cn } from '@/lib/utils';
import type { PaidCancelDisposition } from '@/lib/services/orders/order-cancel-service';

export interface CancelOrderTarget {
  id: string;
  customerName?: string | null;
  status?: string | null;
  amountPaid?: number | null;
  totalAmount?: number | null;
}

interface CancelOrderDialogProps {
  order: CancelOrderTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: string;
  defaultReason?: string;
  onCancelled?: (result: { cancelled: boolean; requiresOwnerApproval?: boolean }) => void;
}

const PICKED_STATUSES = ['Picked', 'Picked (with issue)', 'Photo', 'Packed', 'For Shipping', 'For Pick-up'];

const QUICK_REASONS = [
  'Customer cancelled',
  'No reply / unresponsive',
  'Duplicate order',
  'Out of stock',
];

const DISPOSITIONS: { value: PaidCancelDisposition; label: string; hint: string }[] = [
  { value: 'store_credit', label: 'Add to customer Store Credit', hint: 'Adds the paid amount to their store credit balance with a ledger entry.' },
  { value: 'refund_pending', label: 'Mark for Refund', hint: 'Alerts owners to pay out the refund and log it in Expenses.' },
  { value: 'already_handled', label: 'Already handled / transferred', hint: 'Payment was already moved or settled elsewhere.' },
];

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CancelOrderDialog({
  order,
  open,
  onOpenChange,
  source = 'app',
  defaultReason = '',
  onCancelled,
}: CancelOrderDialogProps) {
  const supabase = useSupabase();
  const { isManagement } = useRoleCheck();
  const { toast } = useToast();

  const [reason, setReason] = useState(defaultReason);
  const [disposition, setDisposition] = useState<PaidCancelDisposition | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [liveInfo, setLiveInfo] = useState<{ status: string | null; amountPaid: number; customerName: string | null } | null>(null);

  useEffect(() => {
    if (!open || !order) {
      setReason(defaultReason);
      setDisposition('');
      setLiveInfo(null);
      return;
    }
    setReason(defaultReason);
    setDisposition('');
    if (order.amountPaid !== undefined && order.amountPaid !== null && order.status) {
      setLiveInfo({
        status: order.status,
        amountPaid: Number(order.amountPaid) || 0,
        customerName: order.customerName || null,
      });
      return;
    }
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from('orders')
      .select('status, amount_paid, customers(full_name)')
      .eq('id', order.id)
      .maybeSingle()
      .then(({ data }: { data: { status: string | null; amount_paid: number | null; customers: { full_name: string | null } | { full_name: string | null }[] | null } | null }) => {
        if (cancelled || !data) return;
        const cust = Array.isArray(data.customers) ? data.customers[0] : data.customers;
        setLiveInfo({
          status: data.status ?? order.status ?? null,
          amountPaid: Number(data.amount_paid || 0),
          customerName: cust?.full_name ?? order.customerName ?? null,
        });
      });
    return () => { cancelled = true; };
  }, [open, order, defaultReason, supabase]);

  if (!order) return null;

  const shortId = `#${order.id.slice(0, 7).toUpperCase()}`;
  const status = liveInfo?.status ?? order.status ?? '';
  const customerName = liveInfo?.customerName ?? order.customerName ?? 'Customer';
  const paid = liveInfo?.amountPaid ?? Number(order.amountPaid || 0);
  const isPaid = paid > 0.009;
  const isPicked = PICKED_STATUSES.includes(status);

  const canSubmit = !submitting
    && reason.trim().length > 0
    && (!isPaid || !isManagement || disposition !== '');

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          reason: reason.trim(),
          paidDisposition: isPaid && isManagement ? disposition : undefined,
          source,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not cancel order');

      window.dispatchEvent(new Event('staff-tasks-changed'));
      window.dispatchEvent(new Event('ship-holds-changed'));

      toast({
        title: data.requiresOwnerApproval ? 'Sent to Owners' : 'Order Cancelled',
        description: data.outcome,
      });
      onOpenChange(false);
      onCancelled?.({ cancelled: !!data.cancelled, requiresOwnerApproval: !!data.requiresOwnerApproval });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Cancel failed',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Cancel Order {shortId}
            {status && <Badge variant="outline">{status}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {customerName}
            {isPaid ? ` · ${peso(paid)} paid` : ' · Unpaid (₱0)'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isPicked && (
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              <PackageOpen className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This order is already <strong>{status}</strong>. Cancelling will automatically create a put-back task for <strong>Al &amp; Edric</strong> to return the items to the shelf.
              </span>
            </div>
          )}

          {isPaid && !isManagement && (
            <div className="flex gap-2 rounded-md border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>{peso(paid)}</strong> is already paid. Submitting will alert the owners to decide <strong>Store Credit</strong> or <strong>Refund</strong> before the order is cancelled.
              </span>
            </div>
          )}

          {isPaid && isManagement && (
            <div className="space-y-2">
              <Label>What happens to the {peso(paid)} paid?</Label>
              <div className="space-y-2">
                {DISPOSITIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDisposition(d.value)}
                    className={cn(
                      'w-full rounded-md border p-2.5 text-left transition-colors',
                      disposition === d.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/60',
                    )}
                  >
                    <p className="text-sm font-medium">{d.label}</p>
                    <p className="text-xs text-muted-foreground">{d.hint}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Reason for cancellation</Label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    reason === r ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Write why this order is cancelled..."
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Keep Order
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {isPaid && !isManagement ? 'Send cancel request to owners' : 'Confirm Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
