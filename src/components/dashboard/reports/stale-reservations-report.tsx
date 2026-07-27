'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Printer, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

// An order is "truly stale" if there has been no activity (payment, or the order
// itself if never paid) for this many days. Below the threshold it's treated as an
// active reservation the customer is still paying down.
const STALE_DAYS = 30;

type StaleReservation = {
  id: string;
  orderId: string;
  fullOrderId: string;
  customerId: string | null;
  customerName: string;
  productName: string;
  quantity: number;
  orderDate: string;
  status: string;
  daysOld: number;
  lastPaymentDate: string | null;
  daysSinceActivity: number;
  isStale: boolean;
};

export function StaleReservationsReport() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [reservations, setReservations] = useState<StaleReservation[]>([]);

  useEffect(() => {
    async function fetchReservations() {
      if (!supabase) return;

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('order_items')
          .select(`
            quantity,
            products!inner(name, variant_name),
            orders!inner(
              id,
              order_date,
              status,
              customers!inner(id, full_name)
            )
          `)
          .in('orders.status', ['Pending Payment', 'Processing']);

        if (error) throw error;

        // Fetch the latest payment per order so we can tell active lay-aways
        // (recently paying) apart from genuinely stalled reservations.
        const orderIds = Array.from(new Set((data || []).map((item: any) => item.orders.id)));
        const lastPaymentByOrder: Record<string, string> = {};
        for (let i = 0; i < orderIds.length; i += 200) {
          const chunk = orderIds.slice(i, i + 200);
          const { data: payments, error: payErr } = await supabase
            .from('payments')
            .select('order_id, payment_date, created_at')
            .in('order_id', chunk);
          if (payErr) throw payErr;
          for (const p of payments || []) {
            const when = p.payment_date || p.created_at;
            if (!when) continue;
            const existing = lastPaymentByOrder[p.order_id];
            if (!existing || new Date(when) > new Date(existing)) {
              lastPaymentByOrder[p.order_id] = when;
            }
          }
        }

        const now = Date.now();
        const formatted: StaleReservation[] = (data || []).map((item: any) => {
          const orderDate = new Date(item.orders.order_date);
          const daysOld = Math.floor((now - orderDate.getTime()) / (1000 * 60 * 60 * 24));
          const productName = item.products.variant_name
            ? `${item.products.name} - ${item.products.variant_name}`
            : item.products.name;

          const lastPaymentDate = lastPaymentByOrder[item.orders.id] || null;
          // Days since the last thing happened on this order: a payment if any,
          // otherwise the order date itself (a brand-new unpaid order is not stale).
          const lastActivity = lastPaymentDate ? new Date(lastPaymentDate) : orderDate;
          const daysSinceActivity = Math.floor((now - lastActivity.getTime()) / (1000 * 60 * 60 * 24));

          return {
            id: `${item.orders.id}-${item.products.name}`, // Uniqueish key
            orderId: item.orders.id.split('-')[0].toUpperCase(),
            fullOrderId: item.orders.id,
            customerId: item.orders.customers?.id || null,
            customerName: item.orders.customers?.full_name || 'Unknown',
            productName: productName,
            quantity: item.quantity,
            orderDate: item.orders.order_date,
            status: item.orders.status,
            daysOld,
            lastPaymentDate,
            daysSinceActivity,
            isStale: daysSinceActivity > STALE_DAYS,
          };
        });

        // Oldest activity first within each group.
        formatted.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);

        setReservations(formatted);
      } catch (err) {
        console.error("Failed to fetch stale reservations", err);
      } finally {
        setLoading(false);
      }
    }

    fetchReservations();
  }, [supabase]);

  const staleItems = reservations.filter((r) => r.isStale);
  const activeItems = reservations.filter((r) => !r.isStale);

  const renderRow = (res: StaleReservation) => (
    <TableRow key={res.id} className={res.isStale ? 'bg-destructive/5' : ''}>
      <TableCell>
        <div className="space-y-1">
          <span className={`font-semibold ${res.isStale ? 'text-destructive' : 'text-amber-600'}`}>
            {res.daysOld === 0 ? 'Today' : `${res.daysOld} days ago`}
          </span>
          <div className="text-xs text-muted-foreground">
            {format(new Date(res.orderDate), 'MMM d, yyyy')}
          </div>
        </div>
      </TableCell>
      <TableCell className="font-medium">
        {res.customerId ? (
          <Link href={`/dashboard/customers/${res.customerId}`} className="text-primary hover:underline">
            {res.customerName}
          </Link>
        ) : res.customerName}
      </TableCell>
      <TableCell>{res.productName}</TableCell>
      <TableCell>
        {res.lastPaymentDate ? (
          <div className="space-y-1">
            <span className={`text-sm font-medium ${res.isStale ? 'text-destructive' : 'text-foreground'}`}>
              {res.daysSinceActivity}d ago
            </span>
            <div className="text-xs text-muted-foreground">
              {format(new Date(res.lastPaymentDate), 'MMM d, yyyy')}
            </div>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">No payment yet</span>
        )}
      </TableCell>
      <TableCell className="font-mono text-sm">
        <Link href={`/dashboard/orders/${res.fullOrderId}`} className="font-semibold text-primary hover:underline">
          {res.orderId}
        </Link>
      </TableCell>
      <TableCell>
        <Badge variant={res.status === 'Pending Payment' ? 'destructive' : 'secondary'}>
          {res.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right font-bold text-lg">{res.quantity}</TableCell>
    </TableRow>
  );

  const renderTable = (items: StaleReservation[]) => (
    <Table>
      <TableHeader className="sticky top-0 bg-background z-10">
        <TableRow>
          <TableHead className="w-[140px]">Order Age</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Product</TableHead>
          <TableHead className="w-[130px]">Last Payment</TableHead>
          <TableHead>Order ID</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Qty</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{items.map(renderRow)}</TableBody>
    </Table>
  );

  return (
    <Card className="shadow-sm border-destructive/20 printable-area">
      <CardHeader className="bg-destructive/5 rounded-t-xl pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-headline flex items-center gap-2">
              Stale Reservations
              {reservations.length > 0 && (
                <Badge variant="destructive">{staleItems.length} need attention</Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              Active reservations (Pending Payment &amp; Processing), split by whether the customer is still paying.
              &ldquo;Needs attention&rdquo; = no payment activity in over {STALE_DAYS} days.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
            <Printer className="h-4 w-4 mr-2" />
            Print Report
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : reservations.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="font-medium text-foreground">No active reservations.</p>
            <p className="text-sm mt-1">All orders are currently fulfilled or cancelled.</p>
          </div>
        ) : (
          <div className="divide-y">
            <div>
              <div className="flex items-center gap-2 px-6 py-3 bg-destructive/5">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="font-semibold text-destructive">Needs Attention</span>
                <Badge variant="destructive">{staleItems.length}</Badge>
                <span className="text-xs text-muted-foreground">No payment in over {STALE_DAYS} days &mdash; follow up or cancel.</span>
              </div>
              {staleItems.length === 0 ? (
                <p className="px-6 py-6 text-sm text-muted-foreground">Nothing stalled — every reservation has recent payment activity.</p>
              ) : (
                <ScrollArea className="max-h-[400px] w-full">{renderTable(staleItems)}</ScrollArea>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 px-6 py-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold text-foreground">Active Lay-away / Installment</span>
                <Badge variant="secondary">{activeItems.length}</Badge>
                <span className="text-xs text-muted-foreground">Customer paid within the last {STALE_DAYS} days.</span>
              </div>
              {activeItems.length === 0 ? (
                <p className="px-6 py-6 text-sm text-muted-foreground">No active reservations.</p>
              ) : (
                <ScrollArea className="max-h-[400px] w-full">{renderTable(activeItems)}</ScrollArea>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
