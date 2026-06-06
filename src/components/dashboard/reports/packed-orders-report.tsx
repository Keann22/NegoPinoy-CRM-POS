'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Printer, Download } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import * as xlsx from 'xlsx';

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
  customer: any;
  items: any[];
  paymentMethod: string;
  trackingNumber: string | null;
  amountPaid: number;
  totalAmount: number;
  isDownpaymentCOD: boolean;
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
            payment_method,
            tracking_number,
            amount_paid,
            total_amount,
            customers (
              full_name,
              mobile_number,
              region,
              province,
              city,
              barangay,
              postal_code,
              street_address,
              address_line
            ),
            order_items (
              product_name,
              quantity,
              selling_price_at_sale,
              discount
            )
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
            customer: item.customers,
            items: item.order_items || [],
            paymentMethod: item.payment_method || 'COD',
            trackingNumber: item.tracking_number,
            amountPaid: item.amount_paid || 0,
            totalAmount: item.total_amount || 0,
            isDownpaymentCOD: false // Not directly fetched, assuming if COD and amountPaid < totalAmount it's COD
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

  const handleExportExcel = () => {
    const exportData: any[] = [];

    orders.forEach(order => {
      // Create a row for each item in the order
      if (order.items.length === 0) {
        order.items = [{ product_name: 'Item', quantity: 1, selling_price_at_sale: order.totalAmount, discount: 0 }];
      }

      const isCOD = order.paymentMethod === 'COD' || order.amountPaid < order.totalAmount;
      const codAmount = isCOD ? (order.totalAmount - order.amountPaid) : 0;
      
      const detailedAddress = order.customer?.street_address 
        ? order.customer.street_address 
        : order.customer?.address_line || 'N/A';

      order.items.forEach((item, index) => {
        exportData.push({
          'Order Number': order.orderId,
          '*Recipient Name': order.customer?.full_name || 'Unknown',
          '*Recipient Phone': order.customer?.mobile_number || '00000000000',
          '*Detailed Address': detailedAddress,
          'Region': order.customer?.region || '',
          'Province': order.customer?.province || '',
          'Town/City': order.customer?.city || '',
          'Barangay': order.customer?.barangay || '',
          'Postal Code': order.customer?.postal_code || '',
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
          'COD Amount': index === 0 ? codAmount : 0, // only charge COD on the first row of multi-item order to avoid duplication
          '*Parcel Value (PHP)': order.totalAmount
        });
      });
    });

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Order Sheet");
    
    // Add dummy sheets to match the template if needed, but Order Sheet is the main one
    xlsx.writeFile(workbook, `Packed_Orders_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={loading || orders.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export to Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" /> Print Report
            </Button>
          </div>
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
