'use client';

import React from 'react';
import { format, parseISO } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { LayawayCustomerHistoryOrder } from '@/types/accounting.types';

interface LayawayHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  orders: LayawayCustomerHistoryOrder[];
  isLoading: boolean;
}

export function LayawayHistoryDialog({
  open,
  onOpenChange,
  customerName,
  orders,
  isLoading,
}: LayawayHistoryDialogProps) {
  const formatMoney = (val: number) =>
    '₱' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
      case 'Payment Received (COD)':
        return <Badge className="bg-emerald-600 hover:bg-emerald-700">{status}</Badge>;
      case 'Shipped':
        return <Badge className="bg-blue-600 hover:bg-blue-700">{status}</Badge>;
      case 'Processing':
        return <Badge variant="secondary">Processing</Badge>;
      case 'Cancelled':
      case 'Returned':
        return <Badge variant="destructive">{status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Customer Order History: <span className="text-primary">{customerName}</span>
          </DialogTitle>
          <DialogDescription>
            Review all past and current orders for this customer to cross-check if this lay-away was already shipped or completed under another order.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : orders.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No other orders found for this customer.
          </div>
        ) : (
          <div className="rounded-md border mt-2">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 text-xs">
                  <TableHead className="w-24">Order ID</TableHead>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-28">Method</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Items / Tracking / Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {orders.map((o) => (
                  <TableRow key={o.id} className={o.status === 'Completed' ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''}>
                    <TableCell className="font-mono font-medium text-foreground">
                      #{o.id.substring(0, 8)}
                    </TableCell>
                    <TableCell>
                      {o.orderDate ? format(parseISO(o.orderDate), 'MMM d, yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{o.paymentMethod}</span>
                    </TableCell>
                    <TableCell>{getStatusBadge(o.status)}</TableCell>
                    <TableCell className="text-right font-medium">{formatMoney(o.totalAmount)}</TableCell>
                    <TableCell className="text-right font-medium text-emerald-600">
                      {formatMoney(o.amountPaid)}
                    </TableCell>
                    <TableCell className="max-w-xs space-y-1">
                      <div className="font-medium text-foreground truncate" title={o.itemsSummary}>
                        {o.itemsSummary}
                      </div>
                      {o.trackingNumber && (
                        <div className="text-[11px] text-muted-foreground">
                          <span className="font-semibold text-primary">Tracking:</span> {o.trackingNumber}
                        </div>
                      )}
                      {o.notes && (
                        <div className="text-[11px] italic text-muted-foreground line-clamp-2" title={o.notes}>
                          {o.notes}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
