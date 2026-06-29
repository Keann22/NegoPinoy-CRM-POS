'use client';

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { MoreHorizontal } from 'lucide-react';
import { ORDER_STATUSES } from '@/types';
import type { FormattedOrder, Order, OrderStatus } from '@/types';

type StatusVariant = 'outline' | 'secondary' | 'destructive' | 'default';

function getStatusVariant(status: OrderStatus): StatusVariant {
  switch (status) {
    case 'Shipped': case 'Completed': case 'Payment Received (COD)': case 'For Shipping': case 'For Pick-up': case 'Waiting for Stock':
      return 'outline';
    case 'Packed': case 'Processing': case 'On-Hold':
      return 'secondary';
    case 'Cancelled': case 'Returned':
      return 'destructive';
    default:
      return 'default';
  }
}

interface OrdersTableProps {
  orders: FormattedOrder[];
  isLoading: boolean;
  selectedOrderIds: string[];
  onSelectAll: (checked: boolean) => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onViewDetails: (order: FormattedOrder) => void;
  onLogPayment: (order: FormattedOrder) => void;
  onEditPaymentTerms: (order: FormattedOrder) => void;
  onMarkShipped: (order: FormattedOrder) => void;
  onViewWaybill: (order: FormattedOrder) => void;
  onCodPayment: (order: FormattedOrder) => void;
  onDueDate: (order: FormattedOrder) => void;
  onStatusChange: (orderId: string, newStatus: OrderStatus) => void;
  isAdminOrOwner: boolean;
  isInventoryOnly: boolean;
  canCreateOrder: boolean;
  userRoles: string[];
}

export function OrdersTable({
  orders, isLoading, selectedOrderIds,
  onSelectAll, onSelectOne, onViewDetails,
  onLogPayment, onEditPaymentTerms, onMarkShipped,
  onViewWaybill, onCodPayment, onDueDate, onStatusChange,
  isAdminOrOwner, isInventoryOnly, canCreateOrder, userRoles,
}: OrdersTableProps) {
  const allSelected = orders.length > 0 && orders.every(o => selectedOrderIds.includes(o.id));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px]">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) => onSelectAll(!!checked)}
              aria-label="Select all"
            />
          </TableHead>
          <TableHead>Customer</TableHead>
          <TableHead className="hidden sm:table-cell">Type</TableHead>
          <TableHead className="hidden sm:table-cell">Status</TableHead>
          <TableHead className="hidden md:table-cell">Date</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-4" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell className="hidden sm:table-cell"><Skeleton className="h-6 w-28 rounded-full" /></TableCell>
            <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
          </TableRow>
        ))}

        {orders.map((order) => {
          const isCompletedOrShipped = order.orderStatus === 'Completed' || order.orderStatus === 'Shipped';
          const canEditOrder = isAdminOrOwner || userRoles?.includes('Sales') || !isCompletedOrShipped;

          return (
            <TableRow key={order.id}>
              <TableCell>
                <Checkbox
                  checked={selectedOrderIds.includes(order.id)}
                  onCheckedChange={(checked) => onSelectOne(order.id, !!checked)}
                  aria-label={`Select order ${order.id}`}
                />
              </TableCell>
              <TableCell>
                <div className="font-medium">{order.customerName}</div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {order.paymentType}
                {order.paymentType === 'Installment' && (
                  <span className="text-muted-foreground text-xs ml-1">({order.installmentMonths || 'N/A'} mos)</span>
                )}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <Badge variant={getStatusVariant(order.orderStatus)}>{order.orderStatus}</Badge>
                {order.paymentType === 'Installment' && (Number(order.totalAmount) || 0) > 0 && (
                  <div className="mt-2 w-24">
                    <Progress value={((Number(order.amountPaid) || 0) / (Number(order.totalAmount) || 1)) * 100} className="h-1" />
                    {order.installmentMonths && order.monthlyPayment && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ₱{Number(order.monthlyPayment).toFixed(2)} / mo. for {order.installmentMonths} mos.
                      </p>
                    )}
                  </div>
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell">{order.formattedDate}</TableCell>
              <TableCell className="text-right">{order.formattedTotal}</TableCell>
              <TableCell>
                <div className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button aria-haspopup="true" size="icon" variant="ghost">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Toggle menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => onViewDetails(order)}>View Details</DropdownMenuItem>

                      {(order.orderStatus === 'For Pick-up' || order.orderStatus === 'Shipped' || order.orderStatus === 'Completed') && order.spx_sync_data && (
                        <DropdownMenuItem onClick={() => onViewWaybill(order)}>View Waybill</DropdownMenuItem>
                      )}

                      {!isInventoryOnly && canEditOrder && (
                        <>
                          <DropdownMenuItem onClick={() => onLogPayment(order)}>Log Payment</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onEditPaymentTerms(order)}>Edit Payment Terms</DropdownMenuItem>
                          {((order.paymentType === 'Installment' || order.paymentType === 'Lay-away') && order.balanceDue > 0) && (
                            <DropdownMenuItem onClick={() => onDueDate(order)}>Set Next Due Date</DropdownMenuItem>
                          )}
                        </>
                      )}

                      {(order.orderStatus === 'Shipped' || order.orderStatus === 'Processing') && (
                        <DropdownMenuItem onClick={() => onMarkShipped(order)}>
                          {order.orderStatus === 'Shipped' ? 'Update Tracking' : 'Mark Shipped'}
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger disabled={!canEditOrder && !isInventoryOnly}>
                          <span>Update Status</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuRadioGroup
                            value={order.orderStatus}
                            onValueChange={(newStatus) => {
                              if (newStatus === order.orderStatus) return;
                              if (newStatus === 'Payment Received (COD)') onCodPayment(order);
                              else if (newStatus === 'Completed' && (order.paymentType === 'Installment' || order.paymentType === 'Lay-away') && order.balanceDue > 0) onDueDate(order);
                              else if (newStatus === 'Shipped') onMarkShipped(order);
                              else onStatusChange(order.id, newStatus as OrderStatus);
                            }}
                          >
                            {ORDER_STATUSES.map(status => (
                              <DropdownMenuRadioItem key={status} value={status} disabled={order.orderStatus === status}>
                                {status}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      {!isInventoryOnly && canEditOrder && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            onClick={() => onStatusChange(order.id, 'Cancelled')}
                            disabled={order.orderStatus === 'Cancelled' || order.orderStatus === 'Returned'}
                          >
                            Cancel Order
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
