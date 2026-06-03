'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Printer } from 'lucide-react';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

type PackedOrder = {
  id: string;
  orderId: string;
  customerName: string;
  orderDate: string;
  daysOld: number;
  length: number | null;
  width: number | null;
  height: number | null;
  weight: number | null;
};

export function PackedOrdersReport() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<PackedOrder[]>([]);

  useEffect(() => {
    async function fetchPackedOrders() {
      if (!supabase) return;
      
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            order_date,
            package_length,
            package_width,
            package_height,
            package_weight,
            customers!inner(full_name)
          `)
          .eq('status', 'Packed')
          .order('order_date', { ascending: true });
        
        if (error) throw error;

        const formatted: PackedOrder[] = (data || []).map((item: any) => {
          const date = new Date(item.order_date);
          return {
            id: item.id,
            orderId: item.id.split('-')[0].toUpperCase(),
            customerName: item.customers?.full_name || 'Unknown',
            orderDate: item.order_date,
            daysOld: differenceInDays(new Date(), date),
            length: item.package_length,
            width: item.package_width,
            height: item.package_height,
            weight: item.package_weight,
          };
        });

        setOrders(formatted);
      } catch (err) {
        console.error("Failed to fetch packed orders", err);
      } finally {
        setLoading(false);
      }
    }

    fetchPackedOrders();
  }, [supabase]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Card className="print:shadow-none print:border-none">
      <CardHeader className="print:hidden">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <CardTitle>Packed Orders Report</CardTitle>
            <CardDescription>
              All orders currently in "Packed" status waiting to be shipped. 
              <br />Useful for courier bulk uploads.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Print Report
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] print:h-auto rounded-md border print:border-none">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Days Packed</TableHead>
                <TableHead className="text-right">Dim (L x W x H)</TableHead>
                <TableHead className="text-right">Weight (kg)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin mb-4" />
                    Fetching packed orders...
                  </TableCell>
                </TableRow>
              )}
              {!loading && orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    No packed orders found. All clear!
                  </TableCell>
                </TableRow>
              )}
              {!loading && orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono">{order.orderId}</TableCell>
                  <TableCell className="font-medium">{order.customerName}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className={
                        order.daysOld > 7 ? 'text-red-600 font-bold' : 
                        order.daysOld > 3 ? 'text-amber-600 font-semibold' : ''
                      }>
                        {order.daysOld} days old
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Ordered: {format(new Date(order.orderDate), 'MMM d')}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {order.length && order.width && order.height ? 
                      `${order.length}x${order.width}x${order.height} cm` : 
                      '—'
                    }
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {order.weight ? `${order.weight} kg` : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
      <style>{`
        @media print {
            .print\\:hidden { display: none !important; }
            @page { margin: 1cm; }
        }
      `}</style>
    </Card>
  );
}
