'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, PackageSearch } from 'lucide-react';
import { format } from 'date-fns';

// Tracking numbers are only assigned once an order is dispatched, so orders
// still moving through the warehouse (Processing, Picked, Packed, Photo,
// On-Hold, For Shipping) legitimately have none yet. Only these statuses mean
// the parcel actually left.
const DISPATCHED_STATUSES = [
  'Payment Received (COD)',
  'Completed',
  'Shipped',
  'Returned',
  'For Pick-up',
];

type MissingTrackingOrder = {
  id: string;
  shortId: string;
  customerName: string;
  customerId: string | null;
  orderDate: string;
  status: string;
  paymentMethod: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
};

export function MissingTrackingReport() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<MissingTrackingOrder[]>([]);
  const [scopeFilter, setScopeFilter] = useState<'dispatched' | 'all'>('dispatched');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [editingTracking, setEditingTracking] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const fetchOrders = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      // Narrow to blank tracking numbers server-side and page through the
      // results — Supabase caps a single response at 1000 rows, which silently
      // truncated this report once the orders table grew past that.
      // Cancelled orders are dropped outright: they never ship, so a missing
      // tracking number on one is never something to act on.
      const PAGE_SIZE = 1000;
      const rows: any[] = [];
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            order_date,
            status,
            payment_method,
            total_amount,
            amount_paid,
            balance_due,
            tracking_number,
            customers ( id, full_name )
          `)
          .or('tracking_number.is.null,tracking_number.eq.')
          .neq('status', 'Cancelled')
          .order('order_date', { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }

      // Guard against whitespace-only values the server-side filter can't catch
      const filtered = rows.filter(
        (o: any) => !o.tracking_number || o.tracking_number.trim() === ''
      );

      setOrders(
        filtered.map((o: any) => ({
          id: o.id,
          shortId: o.id.substring(0, 7).toUpperCase(),
          customerName: o.customers?.full_name || 'Unknown',
          customerId: o.customers?.id || null,
          orderDate: o.order_date,
          status: o.status || 'Unknown',
          paymentMethod: o.payment_method || 'COD',
          totalAmount: o.total_amount || 0,
          amountPaid: o.amount_paid || 0,
          balanceDue: o.balance_due || 0,
        }))
      );
    } catch (err: unknown) {
      console.error('Failed to fetch orders without tracking', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const scopedOrders = useMemo(
    () =>
      scopeFilter === 'all'
        ? orders
        : orders.filter((o) => DISPATCHED_STATUSES.includes(o.status)),
    [orders, scopeFilter]
  );

  const hiddenCount = orders.length - scopedOrders.length;

  // Derive unique filter options from the orders currently in scope
  const statusOptions = useMemo(
    () => Array.from(new Set(scopedOrders.map((o) => o.status))).sort(),
    [scopedOrders]
  );
  const paymentOptions = useMemo(
    () => Array.from(new Set(scopedOrders.map((o) => o.paymentMethod))).sort(),
    [scopedOrders]
  );

  const filteredOrders = useMemo(() => {
    return scopedOrders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (paymentFilter !== 'all' && o.paymentMethod !== paymentFilter) return false;
      return true;
    });
  }, [scopedOrders, statusFilter, paymentFilter]);

  const handleSave = async (orderId: string) => {
    const trackingValue = editingTracking[orderId]?.trim();
    if (!trackingValue || !supabase) return;

    setSavingIds((prev) => new Set(prev).add(orderId));
    try {
      const { error } = await supabase
        .from('orders')
        .update({ tracking_number: trackingValue })
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: 'Tracking Updated',
        description: `Tracking number saved for Order #${orderId.substring(0, 7).toUpperCase()}.`,
      });

      // Remove the order from the list and clear editing state
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setEditingTracking((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: message,
      });
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const statusColor = (status: string) => {
    if (status.includes('Payment Received') || status === 'Completed') return 'bg-emerald-100 text-emerald-800';
    if (status === 'For Shipping' || status === 'Packed') return 'bg-blue-100 text-blue-800';
    if (status.includes('Waiting')) return 'bg-amber-100 text-amber-800';
    if (status === 'Cancelled' || status === 'RTS') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PackageSearch className="h-5 w-5" />
              Missing Tracking Numbers
            </CardTitle>
            <CardDescription>
              {scopeFilter === 'dispatched'
                ? 'Dispatched orders that left without a tracking number recorded. You can update tracking numbers directly from this table.'
                : 'Every open order with no tracking number, including ones still in the warehouse that are not expected to have one yet. Cancelled orders are excluded.'}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="outline" className="text-sm px-3 py-1">
              {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
            </Badge>
            {scopeFilter === 'dispatched' && hiddenCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {hiddenCount} not yet dispatched, hidden
              </span>
            )}
          </div>
        </div>
        {/* Filters */}
        <div className="flex flex-wrap gap-3 pt-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Show</label>
            <Select
              value={scopeFilter}
              onValueChange={(v) => {
                setScopeFilter(v as 'dispatched' | 'all');
                setStatusFilter('all');
                setPaymentFilter('all');
              }}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dispatched">Dispatched orders only</SelectItem>
                <SelectItem value="all">All open orders</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Order Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Payment Method</label>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Methods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                {paymentOptions.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
