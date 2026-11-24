'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { fetchOrdersForPrint } from '@/lib/services/orders/order-print-service';
import { OrderFormPrint } from '@/components/dashboard/orders/order-form-print';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { Order } from '@/hooks/useProcessedOrders';
import type { OrderItemChange } from '@/types/order-changes';

export type ReprintConfirmClear = {
  count: number;
  onConfirm: () => Promise<void> | void;
};

type Job = {
  orders: Order[];
  changes: Record<string, OrderItemChange[]>;
  compact: boolean;
  confirmClear?: ReprintConfirmClear;
};

/**
 * Prints one or more order forms from any page, without the page around them.
 * Render `printView` somewhere in the component; call `reprint(ids)`.
 * Works on iPhone and Huawei: it's the browser's normal print (or share → print).
 * When `options.confirmClear` is passed, asks the user to confirm printing
 * succeeded after the print dialog closes before clearing change notices.
 */
export function useReprintOrders() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<ReprintConfirmClear | null>(null);
  const [confirming, setConfirming] = useState(false);

  const reprint = useCallback(
    async (
      orderIds: string[],
      changes: Record<string, OrderItemChange[]> = {},
      options: { compact?: boolean; confirmClear?: ReprintConfirmClear } = {}
    ) => {
      if (!supabase || orderIds.length === 0) return false;
      setBusy(true);
      try {
        const orders = await fetchOrdersForPrint(supabase, orderIds);
        if (orders.length === 0) return false;
        setJob({
          orders,
          changes,
          compact: Boolean(options.compact),
          confirmClear: options.confirmClear,
        });
        return true;
      } finally {
        setBusy(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    if (!job) return;
    document.body.classList.add('reprinting');
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      document.body.classList.remove('reprinting');
      const nextConfirm = job.confirmClear ?? null;
      setJob(null);
      if (nextConfirm) setPendingConfirm(nextConfirm);
    };
    const mq = window.matchMedia('print');
    const onMq = (e: MediaQueryListEvent) => { if (!e.matches) done(); };
    window.addEventListener('afterprint', done);
    mq.addEventListener?.('change', onMq);
    // Let the QR codes draw before the print dialog opens.
    const t = window.setTimeout(() => window.print(), 400);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', done);
      mq.removeEventListener?.('change', onMq);
      document.body.classList.remove('reprinting');
    };
  }, [job]);

  const handleConfirmPrinted = async () => {
    if (!pendingConfirm || confirming) return;
    setConfirming(true);
    try {
      await pendingConfirm.onConfirm();
      setPendingConfirm(null);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: e instanceof Error ? e.message : 'Could not update reprint status',
      });
    } finally {
      setConfirming(false);
    }
  };

  const printPortal =
    job && typeof document !== 'undefined'
      ? createPortal(
          <div id="reprint-area" className="font-sans text-sm text-black bg-white">
            {job.orders.map((order, idx) => (
              <div key={order.id} className={job.compact ? 'mb-2.5 break-inside-avoid' : 'mb-4 break-inside-avoid'}>
                <OrderFormPrint order={order} reprint={{ changes: job.changes[order.id] }} compact={job.compact} />
                {idx < job.orders.length - 1 && (
                  <div className={job.compact ? 'mt-2.5 border-b-2 border-dashed border-gray-600 w-full' : 'mt-4 border-b-[3px] border-dashed border-gray-600 w-full'} />
                )}
              </div>
            ))}
            <style>{`
              #reprint-area { display: none; }
              @media print {
                body.reprinting > *:not(#reprint-area) { display: none !important; }
                body.reprinting #reprint-area,
                body.reprinting #reprint-area * { visibility: visible !important; }
                body.reprinting #reprint-area { display: block !important; }
                @page { margin: ${job.compact ? '0.6cm' : '1cm'}; }
              }
            `}</style>
          </div>,
          document.body
        )
      : null;

  const confirmDialog = (
    <AlertDialog
      open={Boolean(pendingConfirm)}
      onOpenChange={(open) => {
        if (!open && !confirming) setPendingConfirm(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Did the reprint finish?</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingConfirm?.count === 1
              ? 'Mark this changed order as reprinted and clear it from the list? If printing failed or you cancelled, choose "Keep in list".'
              : `Mark these ${pendingConfirm?.count ?? 0} changed orders as reprinted and clear them from the list? If printing failed or you cancelled, choose "Keep in list".`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={confirming}
            onClick={() => setPendingConfirm(null)}
          >
            Keep in list
          </Button>
          <Button
            type="button"
            disabled={confirming}
            onClick={() => void handleConfirmPrinted()}
          >
            {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Yes, mark as reprinted
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const printView = (
    <>
      {printPortal}
      {confirmDialog}
    </>
  );

  return { reprint, busy, printView };
}
