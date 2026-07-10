'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Truck, FileText } from 'lucide-react';
import { useSupabase } from '@/lib/supabase/hooks';
import { Skeleton } from '@/components/ui/skeleton';
import { MarkShippedDialog } from '@/components/dashboard/mark-shipped-dialog';
import { WaybillSummaryDialog } from '@/components/dashboard/waybill-summary-dialog';

type PickUpOrder = {
  id: string;
  orderId: string;
  shippingName: string;
  shippingPhone: string;
  orderDate: string;
  shippingAmount: number;
  paymentType: string;
  totalAmount: number;
  items: any[];
  shippingAddress: any;
  tracking_number: string;
  spx_sync_data: any;
};

export default function ForPickUpPage() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<PickUpOrder[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [markShippedOrder, setMarkShippedOrder] = useState<{id: string, tracking_number: string} | null>(null);

  const totalPages = Math.ceil(orders.length / itemsPerPage) || 1;
  const paginatedOrders = orders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const [viewWaybillOrder, setViewWaybillOrder] = useState<PickUpOrder | null>(null);

  const fetchForPickUpOrders = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_date,
          total_amount,
          shipping_name,
          shipping_phone,
          shipping_payment_type,
          shipping_amount,
          shipping_address,
          tracking_number,
          spx_sync_data,
          order_items (
            product_name,
            quantity,
            selling_price_at_sale,
            discount
          )
        `)
        .eq('status', 'For Pick-up')
        .order('order_date', { ascending: true });
      
      if (error) throw error;

      const formatted: PickUpOrder[] = (data || []).map((item: any) => ({
        id: item.id,
        orderId: item.id.split('-')[0].toUpperCase(),
        shippingName: item.shipping_name || 'Unknown',
        shippingPhone: item.shipping_phone || '',
        orderDate: item.order_date,
        shippingAmount: item.shipping_amount || 0,
        paymentType: item.shipping_payment_type || '',
        totalAmount: item.total_amount || 0,
        items: item.order_items || [],
        shippingAddress: item.shipping_address || {},
        tracking_number: item.tracking_number || '',
        spx_sync_data: item.spx_sync_data || {},
      }));

      setOrders(formatted);
    } catch (err) {
      console.error("Failed to fetch for-pickup orders", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForPickUpOrders();
  }, [supabase]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <CardTitle className="font-headline">For Pick-up</CardTitle>
              <CardDescription>
                Orders synced with SPX and waiting to be picked up by the courier.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Tracking No.</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Shipping Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-48 ml-auto" /></TableCell>
                </TableRow>
              ))}
              {!loading && orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    No orders waiting for pick-up.
                  </TableCell>
                </TableRow>
              )}
              {!loading && paginatedOrders.map(order => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-sm">
                    <Link href={`/dashboard/orders/${order.id}`} className="font-semibold text-primary hover:underline">
                      {order.orderId}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm font-semibold">{order.tracking_number}</TableCell>
                  <TableCell>
                    <div className="font-medium">{order.shippingName}</div>
                    <div className="text-xs text-muted-foreground">{order.shippingAddress?.city || ''}, {order.shippingAddress?.province || ''}</div>
                  </TableCell>
                  <TableCell className="capitalize">{order.paymentType}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setViewWaybillOrder(order)}>
                          <FileText className="h-4 w-4 mr-1" /> View Waybill
                        </Button>
                        <Button variant="default" size="sm" onClick={() => setMarkShippedOrder({ id: order.id, tracking_number: order.tracking_number })}>
                          <Truck className="h-4 w-4 mr-1" /> Mark Shipped
                        </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Showing <strong>{orders.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, orders.length)}</strong> of <strong>{orders.length}</strong> orders
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || loading}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || loading || orders.length === 0}
            >
              Next
            </Button>
          </div>
        </CardFooter>
      </Card>

      {markShippedOrder && (
        <MarkShippedDialog
            open={!!markShippedOrder}
            onOpenChange={(isOpen) => {
                if (!isOpen) setMarkShippedOrder(null);
            }}
            orderId={markShippedOrder.id}
            currentTrackingNumber={markShippedOrder.tracking_number}
            onSuccess={() => {
                fetchForPickUpOrders();
                setMarkShippedOrder(null);
            }}
        />
      )}

      {viewWaybillOrder && (
        <WaybillSummaryDialog
            open={!!viewWaybillOrder}
            onOpenChange={(isOpen) => {
                if (!isOpen) setViewWaybillOrder(null);
            }}
            order={viewWaybillOrder}
        />
      )}
    </>
  );
}
