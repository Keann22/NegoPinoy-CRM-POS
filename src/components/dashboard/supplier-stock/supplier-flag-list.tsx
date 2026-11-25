'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ANSWER_LABELS, SUPPLIER_FLAG_HINTS } from '@/lib/supplier-stock/supplier-flag-rules';
import { SupplierFlagBadge } from './supplier-flag-badge';
import type { SupplierFlagWithOrders } from '@/types/supplier-stock.types';

const phTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

function answerTone(answer: string | null) {
  if (!answer || answer === 'asked') return 'text-red-700 dark:text-red-400 font-semibold';
  if (answer === 'waiting_customer' || answer === 'editing') return 'text-amber-700 dark:text-amber-400';
  return 'text-emerald-700 dark:text-emerald-400';
}

/** Wala sa Supplier page: each flagged item with the orders waiting for it and sales' answers. */
export function SupplierFlagList({
  flags, canSetStatus, onEdit,
}: {
  flags: SupplierFlagWithOrders[];
  canSetStatus: boolean;
  onEdit: (flag: SupplierFlagWithOrders) => void;
}) {
  if (flags.length === 0) {
    return <p className="rounded-lg border bg-muted/40 p-6 text-center text-sm text-muted-foreground">No items are marked out at the supplier.</p>;
  }

  const withOrders = flags.filter((f) => f.orders.length > 0);
  const withoutOrders = flags.filter((f) => f.orders.length === 0);

  const renderList = (items: SupplierFlagWithOrders[], emptyText: string) => {
    if (items.length === 0) {
      return <p className="rounded-lg border bg-muted/40 p-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
    }
    return (
      <ul className="space-y-3">
        {items.map((f) => (
          <li key={f.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold break-words">{f.productName}</p>
                <SupplierFlagBadge flag={f} showCheck />
                <p className="text-xs text-muted-foreground">{SUPPLIER_FLAG_HINTS[f.status]}</p>
                {f.altProductName && <p className="text-sm">Offer instead: <span className="font-medium">{f.altProductName}</span></p>}
                {f.newPrice != null && <p className="text-sm">New price: <span className="font-medium">{peso(f.newPrice)}</span></p>}
                {f.note && <p className="text-sm break-words">“{f.note}”</p>}
                <p className="text-xs text-muted-foreground">
                  {f.setByName ? `${f.setByName} · ` : ''}{phTime(f.setAt)}
                  {f.status === 'stop_selling' ? ` · ${f.freeToSell} left to sell` : ''}
                </p>
              </div>
              {canSetStatus && <Button size="sm" variant="outline" onClick={() => onEdit(f)}>Change / Back in stock</Button>}
            </div>

            {f.orders.length === 0 ? (
              <p className="text-xs text-muted-foreground">No open orders waiting for it.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr><th className="py-1 pr-2">Order</th><th className="pr-2">Customer</th><th className="pr-2">Agent</th><th className="pr-2 text-right">Paid</th><th>Sales answer</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {f.orders.map((o) => (
                      <tr key={o.orderId}>
                        <td className="py-1 pr-2">
                          <Link href={`/dashboard/orders/${o.orderId}`} className="font-mono text-primary hover:underline">#{o.orderId.slice(0, 7).toUpperCase()}</Link>
                        </td>
                        <td className="pr-2">{o.customerName}</td>
                        <td className="pr-2">{o.agent || '—'}</td>
                        <td className="pr-2 text-right">{o.paid > 0 ? peso(o.paid) : '—'}</td>
                        <td className={o.covered && !o.answer ? 'text-muted-foreground' : answerTone(o.answer)}>
                          {o.covered && !o.answer ? 'On the shelf, nothing to ask' : ANSWER_LABELS[o.answer || 'asked']}
                          {o.answeredBy && o.answer !== 'asked' ? <span className="font-normal text-muted-foreground"> · {o.answeredBy}{o.answeredAt ? `, ${phTime(o.answeredAt)}` : ''}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <Tabs defaultValue="with_orders" className="space-y-3">
      <TabsList>
        <TabsTrigger value="with_orders">With waiting orders ({withOrders.length})</TabsTrigger>
        <TabsTrigger value="without_orders">No waiting orders ({withoutOrders.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="with_orders">
        {renderList(withOrders, 'No flagged items have waiting orders.')}
      </TabsContent>
      <TabsContent value="without_orders">
        {renderList(withoutOrders, 'No flagged items without waiting orders.')}
      </TabsContent>
    </Tabs>
  );
}
