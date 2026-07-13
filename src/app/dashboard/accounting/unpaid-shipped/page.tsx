'use client';

import { useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import { format, differenceInDays } from 'date-fns';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const UNPAID_STATUSES = ['Shipped', 'Completed'];
const OVERDUE_DAYS_THRESHOLD = 14;

type UnpaidShippedOrder = {
  id: string;
  totalAmount: number;
  balanceDue: number;
  orderDate: string;
  shippedAt: string;
  customerId: string;
  customerName: string;
  paymentType: string;
  orderStatus: string;
  trackingNumber?: string;
};

export default function UnpaidShippedOrdersPage() {
  const supabase = useSupabase();
  const { user } = useUser();
  const { userProfile } = useUserProfile();

  const isManagement = useMemo(
    () => userProfile?.roles.some(r => ['Admin', 'Owner'].includes(r)),
    [userProfile]
  );

  const [orders, setOrders] = useState<UnpaidShippedOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !user || !isManagement) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { data: ordersData, error } = await supabase
          .from('orders')
          .select('id, total_amount, balance_due, order_date, created_at, shipped_at, customer_id, payment_method, status, tracking_number')
          .gt('balance_due', 0)
          .in('status', UNPAID_STATUSES)
          .order('shipped_at', { ascending: true, nullsFirst: true });

        if (error) throw error;

        const mapped = ordersData || [];
        if (mapped.length === 0) { setOrders([]); return; }

        const customerIds = Array.from(new Set(mapped.map((o: any) => o.customer_id)));
        const { data: customersData } = await supabase
          .from('customers')
          .select('id, full_name')
          .in('id', customerIds);

        const customerMap = new Map<string, string>();
        (customersData || []).forEach((c: any) => customerMap.set(c.id, c.full_name || 'Unknown Customer'));

        setOrders(mapped
          .filter((o: any) => o.shipped_at)
          .map((o: any) => ({
            id: o.id,
            totalAmount: Number(o.total_amount) || 0,
            balanceDue: Number(o.balance_due) || 0,
            orderDate: o.order_date || o.created_at,
            shippedAt: o.shipped_at,
            customerId: o.customer_id,
            customerName: customerMap.get(o.customer_id) || 'Unknown Customer',
            paymentType: o.payment_method,
            orderStatus: o.status,
            trackingNumber: o.tracking_number,
          })));
      } catch (err) {
        console.error('Unpaid shipped orders fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [supabase, user, isManagement]);

  const overdueUnpaidOrders = useMemo(() => {
    return orders.filter(o => differenceInDays(new Date(), new Date(o.shippedAt)) >= OVERDUE_DAYS_THRESHOLD);
  }, [orders]);

  const totalOutstanding = useMemo(
    () => overdueUnpaidOrders.reduce((sum, o) => sum + o.balanceDue, 0),
    [overdueUnpaidOrders]
  );

  if (userProfile && !isManagement) {
    return (
      <Card className="m-6 border-destructive/20 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Access Denied</CardTitle>
          <CardDescription>You do not have permission to view this page.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="font-headline">Unpaid Shipped Orders</CardTitle>
              <CardDescription>
                Orders that have already shipped but still have a balance due {OVERDUE_DAYS_THRESHOLD}+ days after shipping.
              </CardDescription>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-muted-foreground">Total Outstanding</p>
              {isLoading ? (
                <Skeleton className="h-8 w-32 mt-1" />
              ) : (
                <p className="text-2xl font-bold">₱{totalOutstanding.toFixed(2)}</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Shipped Date</TableHead>
                <TableHead>Days Since Shipped</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tracking #</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead className="text-right">Balance Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))}
              {overdueUnpaidOrders.map((order) => {
                const daysSinceShipped = differenceInDays(new Date(), new Date(order.shippedAt));
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      {order.customerId ? (
                        <Link href={`/dashboard/customers/${order.customerId}`} className="text-primary hover:underline">
                          {order.customerName}
                        </Link>
                      ) : order.customerName}
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">
                        <Link href={`/dashboard/orders/${order.id}`} className="hover:underline">
                          #{order.id.split('-')[0].toUpperCase()}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>{format(new Date(order.shippedAt), 'PPP')}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{daysSinceShipped} days</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{order.orderStatus}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{order.trackingNumber || '—'}</TableCell>
                    <TableCell className="text-right">₱{order.totalAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-semibold">₱{order.balanceDue.toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {!isLoading && overdueUnpaidOrders.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
              <p className="text-lg font-semibold">No Overdue Unpaid Shipments</p>
              <p className="text-muted-foreground mt-2">
                All shipped orders have been paid, or none are overdue by {OVERDUE_DAYS_THRESHOLD}+ days.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
