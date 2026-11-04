'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type {
  DiscrepancyItem,
  DiscrepancyListResponse,
  ReconcileAction,
} from '@/types/payment-discrepancy.types';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** What the fix will do, in words, so nobody clicks blind. */
export function confirmText(item: DiscrepancyItem, action: ReconcileAction): string {
  const share = item.gcashAmount - item.othersTotal;
  const shared = item.others.length > 0
    ? `\n\nThe ${peso(item.gcashAmount)} GCash transfer also paid ` +
      item.others.map((o) => `#${o.orderShortId} (${peso(o.amount)})`).join(', ') +
      `, so this order's part is ${peso(share)}.`
    : '';

  switch (action) {
    case 'overpayment_credit':
      return `Order #${item.orderShortId}: raise the payment from ${peso(item.recordedAmount)} to ${peso(share)}. ` +
        `Anything above the order total goes to the customer's store credit.${shared}`;
    case 'tip':
      return `Order #${item.orderShortId}: raise the payment from ${peso(item.recordedAmount)} to ${peso(share)} ` +
        `and keep the extra as a tip (no store credit).${shared}`;
    case 'typo_correction':
      return `Order #${item.orderShortId}: lower the payment from ${peso(item.recordedAmount)} to ` +
        `${peso(item.gcashAmount)}, the GCash amount. The customer will owe the difference.\n\n` +
        'Check the proof photo first: if it shows the recorded amount, the GCash figure is wrong, so don\'t fix it here.';
    case 'split_payment': {
      const total = item.recordedAmount + item.othersTotal;
      const left = item.gcashAmount - total;
      return `One GCash transfer of ${peso(item.gcashAmount)} paid these orders:\n` +
        `• #${item.orderShortId}: ${peso(item.recordedAmount)}\n` +
        item.others.map((o) => `• #${o.orderShortId}: ${peso(o.amount)}`).join('\n') +
        `\n\nTotal ${peso(total)}.` +
        (left > 1 ? ` ${peso(left)} is not on any order yet.` : ' Fully accounted for.') +
        '\n\nLink them and mark all as checked?';
    }
  }
}

export function usePaymentDiscrepancies() {
  const { toast } = useToast();
  const [items, setItems] = useState<DiscrepancyItem[]>([]);
  const [currentUser, setCurrentUser] = useState<DiscrepancyListResponse['currentUser'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/payments/discrepancies', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setItems((data as DiscrepancyListResponse).items);
      setCurrentUser((data as DiscrepancyListResponse).currentUser);
    } catch (err: unknown) {
      toast({
        title: 'Error loading discrepancies',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const reconcile = useCallback(async (item: DiscrepancyItem, action: ReconcileAction) => {
    if (!window.confirm(confirmText(item, action))) return;
    try {
      setProcessingId(item.paymentId);
      const res = await fetch('/api/payments/reconcile-discrepancy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: item.paymentId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fix');
      toast({ title: `Order #${item.orderShortId} fixed`, description: data.message });
    } catch (err: unknown) {
      toast({
        title: 'Not fixed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      // Reload either way: other rows on the same transfer may have changed too.
      await load();
      setProcessingId(null);
    }
  }, [load, toast]);

  return { items, currentUser, isLoading, processingId, reconcile };
}
