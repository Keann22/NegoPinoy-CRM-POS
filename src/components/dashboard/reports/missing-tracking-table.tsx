import Link from 'next/link';
import { format } from 'date-fns';
import { Loader2, Save } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { MissingTrackingOrder } from './missing-tracking-types';

interface MissingTrackingTableProps {
  loading: boolean;
  filteredOrders: MissingTrackingOrder[];
  scopeFilter: 'dispatched' | 'all';
  hiddenCount: number;
  editingTracking: Record<string, string>;
  setEditingTracking: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  savingIds: Set<string>;
  handleSave: (orderId: string) => void;
}

export function MissingTrackingTable({
  loading,
  filteredOrders,
  scopeFilter,
  hiddenCount,
  editingTracking,
  setEditingTracking,
  savingIds,
  handleSave
}: MissingTrackingTableProps) {
  const statusColor = (status: string) => {
    if (status.includes('Payment Received') || status === 'Completed') return 'bg-emerald-100 text-emerald-800';
    if (status === 'For Shipping' || status === 'Packed') return 'bg-blue-100 text-blue-800';
    if (status.includes('Waiting')) return 'bg-amber-100 text-amber-800';
    if (status === 'Cancelled' || status === 'RTS') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <ScrollArea className="h-[600px] rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Order ID</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="w-[280px]">Tracking Number</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                <Loader2 className="mx-auto h-8 w-8 animate-spin mb-4" />
                Loading orders...
              </TableCell>
            </TableRow>
          )}
          {!loading && filteredOrders.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                {scopeFilter === 'dispatched' && hiddenCount > 0
                  ? `No dispatched orders are missing a tracking number. ${hiddenCount} order${hiddenCount !== 1 ? 's are' : ' is'} still in the warehouse — switch "Show" to All open orders to see them.`
                  : 'No orders without tracking numbers found for the selected filters.'}
              </TableCell>
            </TableRow>
          )}
          {!loading &&
            filteredOrders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-mono">
                  <Link
                    href={`/dashboard/orders/${order.id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {order.shortId}
                  </Link>
                </TableCell>
                <TableCell className="font-medium">
                  {order.customerId ? (
                    <Link
                      href={`/dashboard/customers/${order.customerId}`}
                      className="text-primary hover:underline"
                    >
                      {order.customerName}
                    </Link>
                  ) : (
                    order.customerName
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {format(new Date(order.orderDate), 'MMM d, yyyy')}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(order.status)}`}>
                    {order.status}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{order.paymentMethod}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  ₱{order.totalAmount.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {order.balanceDue > 0 ? (
                    <span className="text-red-600 font-medium">₱{order.balanceDue.toLocaleString()}</span>
                  ) : (
                    <span className="text-emerald-600">Paid</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Input
                      placeholder="e.g. SPEPH0..."
                      className="h-8 text-sm"
                      value={editingTracking[order.id] || ''}
                      onChange={(e) =>
                        setEditingTracking((prev) => ({
                          ...prev,
                          [order.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSave(order.id);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 shrink-0"
                      disabled={!editingTracking[order.id]?.trim() || savingIds.has(order.id)}
                      onClick={() => handleSave(order.id)}
                    >
                      {savingIds.has(order.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
