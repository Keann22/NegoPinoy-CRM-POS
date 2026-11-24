'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { ClipboardList, ExternalLink, PauseCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ReprintOrderButton } from '@/components/dashboard/orders/reprint-order-button';
import { ReadyToPickNoteSection } from '@/components/dashboard/tasks/ready-to-pick-note-section';
import { cn } from '@/lib/utils';
import type { ReadyToPickOrder } from '@/types/ready-to-pick.types';

function formatPhtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: '2-digit' });
}

function paymentLabel(o: ReadyToPickOrder): string {
  if (o.paymentMethod === 'Lay-away' && o.isPaid) return 'Lay-away (Paid)';
  if (o.paymentMethod === 'Lay-away') return `Lay-away (${o.paidPercent}%)`;
  if (o.isPaid) return `${o.paymentMethod || 'Order'} (Paid)`;
  return o.paymentMethod || 'COD';
}

interface Props {
  order: ReadyToPickOrder;
  index: number;
  selected: boolean;
  onToggle: () => void;
  onSkip: () => void;
  staff: ComponentProps<typeof ReadyToPickNoteSection>['staff'];
  onReload: () => void;
}

/** One order on Ready to Pick: the items and shelf numbers, Pick Now, or "Hindi pa ipi-pick". */
export function ReadyToPickOrderCard({ order, index, selected, onToggle, onSkip, staff, onReload }: Props) {
  return (
    <Card className={cn(order.isPaid && 'border-emerald-300 dark:border-emerald-800', selected && 'ring-2 ring-primary')}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select order #${order.orderNo}`} className="mt-1" />
            <div className="space-y-1">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <span className="text-muted-foreground">#{index + 1}</span>
                <Link href={`/dashboard/orders/${order.id}`} target="_blank" className="font-mono font-bold text-primary underline-offset-4 hover:underline">
                  #{order.orderNo}
                </Link>
                <span>{order.customerName}</span>
                <Badge variant={order.isPaid ? 'default' : 'secondary'} className={cn(order.isPaid && 'bg-emerald-600 hover:bg-emerald-600')}>
                  {paymentLabel(order)}
                </Badge>
                {order.noOpenIssue && (
                  <Badge variant="outline" className="text-amber-700 dark:text-amber-400">Re-pick to clear status</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Ordered {formatPhtDate(order.orderDate)}
                {order.salesPersonName ? ` · Sales: ${order.salesPersonName}` : ''}
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/orders/${order.id}`} target="_blank">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />Order Form
              </Link>
            </Button>
            <ReprintOrderButton orderId={order.id} />
            <Button variant="outline" size="sm" onClick={onSkip}>
              <PauseCircle className="mr-1.5 h-3.5 w-3.5" />Hindi pa ipi-pick
            </Button>
            <Button asChild size="sm">
              <Link href={`/dashboard/pick?order=${order.id}`}>
                <ClipboardList className="mr-1.5 h-3.5 w-3.5" />Pick Now
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <ul className="divide-y rounded-md border bg-muted/30 text-sm">
          {order.items.map((item) => (
            <li key={item.productId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="font-medium">{item.name}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="font-mono">Need {item.neededQty}</Badge>
                <span className="font-medium text-emerald-700 dark:text-emerald-400">Shelf: {item.shelfStock}</span>
                {item.shelfLocation && <span className="rounded bg-muted px-1.5 py-0.5">{item.shelfLocation}</span>}
              </span>
            </li>
          ))}
        </ul>
        <ReadyToPickNoteSection orderId={order.id} notes={order.notes} staff={staff} onSaved={onReload} />
      </CardContent>
    </Card>
  );
}
