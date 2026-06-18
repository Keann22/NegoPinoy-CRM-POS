'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Printer } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

type StaleReservation = {
  id: string;
  orderId: string;
  customerName: string;
  productName: string;
  quantity: number;
  orderDate: string;
  status: string;
  daysOld: number;
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
              customers!inner(full_name)
            )
          `)
          .in('orders.status', ['Pending Payment', 'Processing']);
        
        if (error) throw error;

        const formatted: StaleReservation[] = (data || []).map((item: any) => {
          const orderDate = new Date(item.orders.order_date);
          const daysOld = Math.floor((Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
          const productName = item.products.variant_name 
            ? `${item.products.name} - ${item.products.variant_name}`
            : item.products.name;

          return {
            id: `${item.orders.id}-${item.products.name}`, // Uniqueish key
            orderId: item.orders.id.split('-')[0].toUpperCase(),
            customerName: item.orders.customers?.full_name || 'Unknown',
            productName: productName,
            quantity: item.quantity,
            orderDate: item.orders.order_date,
            status: item.orders.status,
            daysOld,
          };
        });

        // Sort by oldest first (descending days old)
        formatted.sort((a, b) => b.daysOld - a.daysOld);

        setReservations(formatted);
      } catch (err) {
        console.error("Failed to fetch stale reservations", err);
      } finally {
        setLoading(false);
      }
    }

    fetchReservations();
  }, [supabase]);

  return (
    <Card className="shadow-sm border-destructive/20 printable-area">
      <CardHeader className="bg-destructive/5 rounded-t-xl pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-headline flex items-center gap-2">
              Stale Reservations
              {reservations.length > 0 && (
                <Badge variant="destructive">{reservations.length} Items</Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              All active reservations (Pending Payment & Processing) sorted by oldest first.
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
          <ScrollArea className="h-[600px] w-full">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[150px]">Age</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.map((res) => (
                  <TableRow key={res.id} className={res.daysOld > 7 ? 'bg-destructive/5' : ''}>
                    <TableCell>
                      <div className="space-y-1">
                        <span className={`font-semibold ${res.daysOld > 7 ? 'text-destructive' : 'text-amber-600'}`}>
                          {res.daysOld === 0 ? 'Today' : `${res.daysOld} days ago`}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(res.orderDate), 'MMM d, yyyy')}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{res.customerName}</TableCell>
                    <TableCell>{res.productName}</TableCell>
                    <TableCell className="font-mono text-sm">{res.orderId}</TableCell>
                    <TableCell>
                      <Badge variant={res.status === 'Pending Payment' ? 'destructive' : 'secondary'}>
                        {res.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg">{res.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
