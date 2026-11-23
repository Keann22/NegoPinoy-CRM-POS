'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSupabase } from '@/lib/supabase/hooks';
import { fetchOrdersForPrint } from '@/lib/services/orders/order-print-service';
import { OrderFormPrint } from '@/components/dashboard/orders/order-form-print';
import type { Order } from '@/hooks/useProcessedOrders';
import type { OrderItemChange } from '@/types/order-changes';

type Job = { orders: Order[]; changes: Record<string, OrderItemChange[]> };

/**
 * Prints one or more order forms from any page, without the page around them.
 * Render `printView` somewhere in the component; call `reprint(ids)`.
 * Works on iPhone and Huawei: it's the browser's normal print (or share → print).
 */
export function useReprintOrders() {
  const supabase = useSupabase();
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);

  const reprint = useCallback(
    async (orderIds: string[], changes: Record<string, OrderItemChange[]> = {}) => {
      if (!supabase || orderIds.length === 0) return false;
      setBusy(true);
      try {
        const orders = await fetchOrdersForPrint(supabase, orderIds);
        if (orders.length === 0) return false;
        setJob({ orders, changes });
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
    const done = () => {
      document.body.classList.remove('reprinting');
      setJob(null);
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

  const printView =
    job && typeof document !== 'undefined'
      ? createPortal(
          <div id="reprint-area" className="font-sans text-sm text-black bg-white">
            {job.orders.map((order, idx) => (
              <div key={order.id} className="mb-4 break-inside-avoid">
                <OrderFormPrint order={order} reprint={{ changes: job.changes[order.id] }} />
                {idx < job.orders.length - 1 && (
                  <div className="mt-4 border-b-[3px] border-dashed border-gray-600 w-full" />
                )}
              </div>
            ))}
            <style>{`
              #reprint-area { display: none; }
              @media print {
                body.reprinting > *:not(#reprint-area) { display: none !important; }
                body.reprinting #reprint-area { display: block !important; }
                @page { margin: 1cm; }
              }
            `}</style>
          </div>,
          document.body
        )
      : null;

  return { reprint, busy, printView };
}
