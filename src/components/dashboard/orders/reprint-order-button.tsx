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
    const ok = await reprint([orderId], notice ? { [orderId]: notice.changes } : {});
    if (ok && notice) {
      await fetch('/api/orders/changes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: [orderId], how: 'reprinted' }),
      }).catch(() => {});
    }
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
