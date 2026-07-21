'use client';

import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format, formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

interface StaffRequestDialogProps {
  productName: string;
  isOpen: boolean;
  onClose: () => void;
  staffRequestedQty: number;
  requestedByName: string | null;
  sourceOrders: any[];
}

export function StaffRequestDialog({
  productName,
  isOpen,
  onClose,
  staffRequestedQty,
  requestedByName,
  sourceOrders
}: StaffRequestDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Staff Request Details</DialogTitle>
          <DialogDescription>
            {requestedByName ? (
              <>Requested by <span className="font-semibold text-foreground">{requestedByName}</span> for <span className="font-semibold text-foreground">{productName}</span></>
            ) : (
              <>Requests for <span className="font-semibold text-foreground">{productName}</span></>
            )}
            {' '}(Total: {staffRequestedQty})
          </DialogDescription>
        </DialogHeader>

        {!sourceOrders || sourceOrders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground italic">
            Manually added. No customer order linked.
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Age</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceOrders.map((order, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      {order.orderDate ? (
                        <div className="space-y-1">
                          <span className="font-medium text-destructive">
                            {formatDistanceToNow(new Date(order.orderDate))} ago
                          </span>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(order.orderDate), 'MMM d, yyyy')}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {order.customerId ? (
                        <Link href={`/dashboard/customers/${order.customerId}`} className="text-primary hover:underline">
                          {order.customerName}
                        </Link>
                      ) : (
                        order.customerName
                      )}
                      {order.paymentType && (
                        <div className="text-xs text-muted-foreground font-normal mt-0.5">{order.paymentType}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      <Link href={`/dashboard/orders/${order.orderId}`} className="font-semibold text-primary hover:underline">
                        {order.shortOrderId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {order.status ? (
                        <Badge variant={order.status === 'Pending Payment' ? 'destructive' : 'secondary'}>
                          {order.status}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg">{order.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
