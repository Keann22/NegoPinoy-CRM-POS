'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, Truck } from 'lucide-react';
import { useSupabase } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { MarkShippedDialog } from '@/components/dashboard/mark-shipped-dialog';
import * as xlsx from 'xlsx';

type ShippingOrder = {
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
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
};

export default function ForShippingPage() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<ShippingOrder[]>([]);
  const [markShippedOrder, setMarkShippedOrder] = useState<{id: string, tracking_number: string} | null>(null);

  const fetchForShippingOrders = async () => {
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
          total_amount,
          shipping_name,
          shipping_phone,
          shipping_payment_type,
          shipping_amount,
          shipping_address,
          order_items (
            product_name,
            quantity,
            selling_price_at_sale,
            discount
          )
        `)
        .eq('status', 'For Shipping')
        .order('order_date', { ascending: true });
      
      if (error) throw error;

      const formatted: ShippingOrder[] = (data || []).map((item: any) => ({
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
        weight: item.package_weight,
        length: item.package_length,
        width: item.package_width,
        height: item.package_height,
      }));

      setOrders(formatted);
    } catch (err) {
      console.error("Failed to fetch for-shipping orders", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForShippingOrders();
  }, [supabase]);

  const handleExportExcel = () => {
    const exportData: any[] = [];

    orders.forEach(order => {
      const items = order.items.length > 0 ? order.items : [{ product_name: 'Item', quantity: 1, selling_price_at_sale: order.totalAmount, discount: 0 }];
      
      const isCOD = order.paymentType.toLowerCase().includes('cod');
      const codAmount = isCOD ? (order.totalAmount + order.shippingAmount) : 0;
      
      const addr = order.shippingAddress || {};
      const detailedAddress = addr.address_line || addr.street_address || 'N/A';

      items.forEach((item: any, index: number) => {
        exportData.push({
          'Order Number': order.orderId,
          '*Recipient Name': order.shippingName,
          '*Recipient Phone': order.shippingPhone,
          '*Detailed Address': detailedAddress,
          'Region': addr.region || '',
          'Province': addr.province || '',
          'Town/City': addr.city || '',
          'Barangay': addr.barangay || '',
          'Postal Code': addr.postal_code || '',
          '*Item Name': item.product_name,
          '*Item Type': 'General',
          'Item Quantity': item.quantity,
          'Item Price': item.selling_price_at_sale,
          '*Parcel Weight (KG)': order.weight || 1,
          '*Parcel Length (CM)': order.length || 10,
          '*Parcel Width (CM)': order.width || 10,
          '*Parcel Height (CM)': order.height || 10,
          'Customer Reference No.': '',
          '*Payment Method': isCOD ? 'COD' : 'Non-COD',
          'Delivery Instruction': '',
          '*COD Collection (Y/N)': isCOD ? 'Y' : 'N',
          'COD Amount': index === 0 ? codAmount : 0, 
          '*Parcel Value (PHP)': order.totalAmount
        });
      });
    });

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Order Sheet");
    xlsx.writeFile(workbook, `For_Shipping_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <CardTitle className="font-headline">For Shipping</CardTitle>
              <CardDescription>
                Verified orders ready to be uploaded to the courier and shipped out.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleExportExcel} disabled={loading || orders.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
                <Download className="mr-2 h-4 w-4" /> Download Courier Format
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Shipping Type</TableHead>
                <TableHead className="text-right">Shipping Fee</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))}
              {!loading && orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    No orders ready for shipping.
                  </TableCell>
                </TableRow>
              )}
              {!loading && orders.map(order => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-sm">{order.orderId}</TableCell>
                  <TableCell>
                    <div className="font-medium">{order.shippingName}</div>
                    <div className="text-xs text-muted-foreground">{order.shippingAddress?.city || ''}, {order.shippingAddress?.province || ''}</div>
                  </TableCell>
                  <TableCell className="capitalize">{order.paymentType}</TableCell>
                  <TableCell className="text-right">₱{order.shippingAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setMarkShippedOrder({ id: order.id, tracking_number: '' })}>
                      <Truck className="h-4 w-4 mr-1" /> Mark Shipped
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
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
                fetchForShippingOrders();
                setMarkShippedOrder(null);
            }}
        />
      )}
    </>
  );
}
