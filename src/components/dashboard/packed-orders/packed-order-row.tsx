'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { Ban, Bus, CheckCircle2, ClipboardCheck, RotateCcw, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import type { PackedOrderRowData } from '@/hooks/usePackedOrders';
import { phtToday, shortPhtDate } from '@/lib/shipping/ship-hold-rules';

interface PackedOrderRowProps {
  order: PackedOrderRowData;
  isWaitingTab: boolean;
  canCancel: boolean;
  canAskSales: boolean;
  onRevert: (order: PackedOrderRowData) => void;
  onHold: (order: PackedOrderRowData) => void;
  onVerify: (order: PackedOrderRowData) => void;
  onCancel: (order: PackedOrderRowData) => void;
  onAskSales: (order: PackedOrderRowData) => void;
}

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function paymentBadge(order: PackedOrderRowData) {
  const paid = Number(order.amountPaid || 0);
  const balance = Number(order.balanceDue || 0);
  const total = Number(order.totalAmount || 0);
  if (paid <= 0.009) {
    return (
      <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700 text-[10px] px-1.5 py-0 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
        Unpaid {total > 0 ? peso(total) : ''}
      </Badge>
    );
  }
  if (balance <= 0.009) {
    return (
      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
        Paid
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-[10px] px-1.5 py-0 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      Partial ({peso(paid)} paid)
    </Badge>
  );
}

export function PackedOrderRow({
  order,
  isWaitingTab,
  canCancel,
  canAskSales,
  onRevert,
  onHold,
  onVerify,
  onCancel,
  onAskSales,
}: PackedOrderRowProps) {
  const today = phtToday();
  const checkOverdue = !!order.checkOn && order.checkOn <= today;

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">
        <Link href={`/dashboard/orders/${order.id}`} className="font-semibold text-primary hover:underline">
          {order.id.split('-')[0].toUpperCase()}
        </Link>
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex flex-col items-start gap-1">
          {order.customerId ? (
            <Link href={`/dashboard/customers/${order.customerId}`} className="text-primary hover:underline">
              {order.customerName}
            </Link>
          ) : order.customerName}
          {paymentBadge(order)}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{order.salesPersonName || '-'}</TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span>{format(new Date(order.orderDate), 'MMM d, yyyy')}</span>
          <span className="text-xs text-muted-foreground">{format(new Date(order.orderDate), 'p')}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span>{format(new Date(order.packedDate), 'MMM d, yyyy')}</span>
          <span className={order.daysPacked > 3 ? 'text-amber-600 text-xs font-semibold' : 'text-xs text-muted-foreground'}>
            {order.daysPacked} days ago
          </span>
        </div>
      </TableCell>
      {isWaitingTab && (
        <TableCell className="text-sm max-w-[230px]">
          <p className="text-muted-foreground truncate" title={order.not_for_shipping_reason || ''}>
            {order.not_for_shipping_reason}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {order.checkOn && (
              <span className={checkOverdue ? 'text-[11px] font-medium text-rose-600' : 'text-[11px] text-muted-foreground'}>
                Check {shortPhtDate(order.checkOn)}
              </span>
            )}
            {order.hasOpenTask && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Task open</Badge>
            )}
          </div>
        </TableCell>
      )}
      <TableCell className="text-right">
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => onRevert(order)} title="Revert to Processing">
            <RotateCcw className="h-4 w-4 mr-1" /> Revert
          </Button>
          <Button variant="outline" size="sm" onClick={() => onHold(order)} className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Not for shipping yet: why, and when to ask again">
            <XCircle className="h-4 w-4 mr-1" /> {isWaitingTab ? 'Change hold' : 'Delay'}
          </Button>
          {isWaitingTab && canAskSales && (
            <Button variant="outline" size="sm" onClick={() => onAskSales(order)} title="Assign a follow-up task to the sales rep">
              <ClipboardCheck className="h-4 w-4 mr-1" /> {order.hasOpenTask ? 'Task sent' : 'Ask Sales'}
            </Button>
          )}
          {canCancel && (
            <Button variant="outline" size="sm" onClick={() => onCancel(order)} className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30" title="Cancel order">
              <Ban className="h-4 w-4 mr-1" /> Cancel
            </Button>
          )}
          <Button variant="outline" size="sm" asChild title="Went by bus: record the fee we paid">
            <Link href={`/dashboard/bus-shipping?order=${order.id}`}><Bus className="h-4 w-4 mr-1" /> Ship by bus</Link>
          </Button>
          <Button variant="default" size="sm" onClick={() => onVerify(order)} className="bg-emerald-600 hover:bg-emerald-700" title="Verify for shipping">
            <CheckCircle2 className="h-4 w-4 mr-1" /> Verify
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
