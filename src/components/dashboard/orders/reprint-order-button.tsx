'use client';

import { Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReprintOrders } from '@/hooks/useReprintOrders';
import type { OrderChangeNotice } from '@/types/order-changes';

/**
 * Reprints this order's form. If the order has an open "changed after printing"
 * notice, the reprint marks what changed and closes the notice.
 */
export function ReprintOrderButton({ orderId }: { orderId: string }) {
  const { reprint, busy, printView } = useReprintOrders();

  const onClick = async () => {
    const res = await fetch('/api/orders/changes', { cache: 'no-store' }).catch(() => null);
    const json = res?.ok ? await res.json() : { notices: [] };
    const notice = (json.notices as OrderChangeNotice[]).find((n) => n.orderId === orderId);
    await reprint([orderId], notice ? { [orderId]: notice.changes } : {}, {
      confirmClear: notice
        ? {
            count: 1,
            onConfirm: async () => {
              const r = await fetch('/api/orders/changes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderIds: [orderId], how: 'reprinted' }),
              });
              if (!r.ok) throw new Error('Could not mark order as reprinted');
            },
          }
        : undefined,
    });
  };

  return (
    <>
      {printView}
      <Button variant="outline" size="sm" onClick={onClick} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
        Reprint
      </Button>
    </>
  );
}
