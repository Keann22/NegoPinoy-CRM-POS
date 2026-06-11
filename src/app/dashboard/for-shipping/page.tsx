'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, Truck, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { MarkShippedDialog } from '@/components/dashboard/mark-shipped-dialog';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

type ShippingOrder = {
  id: string;
  orderId: string;
  shippingName: string;
  shippingPhone: string;
  orderDate: string;
  shippingAmount: number;
  paymentType: string;
  totalAmount: number;
  amountPaid: number;
  items: any[];
  shippingAddress: any;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  deliveryInstructions: string | null;
  boxesConfig: any;
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
          boxes_config,
          total_amount,
          amount_paid,
          shipping_name,
          shipping_phone,
          shipping_payment_type,
          shipping_amount,
          shipping_address,
          delivery_instructions,
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
        amountPaid: item.amount_paid || 0,
        items: item.order_items || [],
        shippingAddress: item.shipping_address || {},
        weight: item.package_weight,
        length: item.package_length,
        width: item.package_width,
        height: item.package_height,
        deliveryInstructions: item.delivery_instructions,
        boxesConfig: item.boxes_config,
      }));

      setOrders(formatted);
    } catch (err) {
      console.error("Failed to fetch for-shipping orders", err);
    } finally {
      setLoading(false);
    }
  };

  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchForShippingOrders();
  }, [supabase]);

  const handleSPXUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;
    
    setLoading(true);
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.worksheets[0];
      
      const orderUpdates: Record<string, {
         tracking_numbers: string[],
         cod_amount: number,
         estimated_shipping_fee: number,
         scheduled_pickup_time: string,
         payment_role: string,
      }> = {};
      
      worksheet.eachRow((row, rowNumber) => {
          const trackingNo = row.getCell(1).value?.toString() || '';
          // Skip header rows
          if (trackingNo.toLowerCase().includes('tracking number') || trackingNo === '' || trackingNo.toLowerCase().includes('order number')) {
              return;
          }
          
          const rawCustRef = row.getCell(3).value?.toString() || ''; 
          const pickupTime = row.getCell(10).value?.toString() || '';
          const paymentRole = row.getCell(32).value?.toString() || '';
          const codAmount = parseFloat(row.getCell(38).value?.toString() || '0') || 0;
          const estShippingFee = parseFloat(row.getCell(42).value?.toString() || '0') || 0;
          
          const orderIdMatch = rawCustRef.match(/ORDER\s*#?\s*([A-Za-z0-9-]+)/i);
          if (orderIdMatch && orderIdMatch[1]) {
              const rawPrefix = orderIdMatch[1].toLowerCase();
              const orderIdPrefix = rawPrefix.replace(/-b\d+$/i, '');
              
              const matchingOrder = orders.find(o => o.id.toLowerCase().startsWith(orderIdPrefix));
              if (matchingOrder) {
                  const fullId = matchingOrder.id;
                  if (!orderUpdates[fullId]) {
                      orderUpdates[fullId] = {
                          tracking_numbers: [],
                          cod_amount: 0,
                          estimated_shipping_fee: 0,
                          scheduled_pickup_time: pickupTime,
                          payment_role: paymentRole
                      };
                  }
                  
                  if (trackingNo && !orderUpdates[fullId].tracking_numbers.includes(trackingNo)) {
                      orderUpdates[fullId].tracking_numbers.push(trackingNo);
                  }
                  orderUpdates[fullId].cod_amount += codAmount;
                  orderUpdates[fullId].estimated_shipping_fee += estShippingFee;
              }
          }
      });
      
      const updatePromises = Object.entries(orderUpdates).map(async ([fullId, data]) => {
          return supabase.from('orders').update({
               status: 'For Pick-up',
               tracking_number: data.tracking_numbers.join(', '),
               spx_sync_data: {
                   scheduled_pickup_time: data.scheduled_pickup_time,
                   estimated_shipping_fee: data.estimated_shipping_fee,
                   cod_amount: data.cod_amount,
                   payment_role: data.payment_role,
                   service_type: 'Standard Service',
                   collect_type: 'Pickup',
                   payment_type: 'Pay by Cycle'
               }
           }).eq('id', fullId);
      });
      
      // Execute sequentially to avoid rate limits
      for (const updateFn of updatePromises) {
          await updateFn;
      }
      
      toast({ title: 'Upload Successful', description: `Synced ${Object.keys(orderUpdates).length} orders to SPX tracking and moved to For Pick-up.` });
      fetchForShippingOrders();
    } catch (err: any) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Upload Failed', description: err.message || 'Failed to process SPX file.' });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const fixMetroManilaCity = (city: string) => {
      let c = city.trim();
      if (c.toUpperCase() === 'CITY OF MANILA') return 'Manila';
      if (c.toUpperCase().startsWith('CITY OF ')) {
          c = c.substring(8).trim() + ' City';
      }
      return c.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  };
  
  const formatBarangay = (brgy: string) => {
      return brgy.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  };

  const mapToSPXAddress = (region: string, province: string, city: string, barangay: string) => {
    let spxRegion = region;
    let spxProvince = province;
    
    const r = (region || '').toUpperCase();
    const p = (province || '').toUpperCase();
    
    if (r.includes('NCR') || r.includes('NATIONAL CAPITAL')) {
        spxRegion = 'Metro Manila';
        spxProvince = 'Metro Manila';
    } else if (r.includes('CAR') || r.includes('REGION I') || r.includes('REGION II') || r.includes('REGION III') || r.includes('ILOCOS') || r.includes('CAGAYAN') || r.includes('CENTRAL LUZON')) {
        spxRegion = 'North Luzon';
    } else if (r.includes('REGION IV') || r.includes('REGION V') || r.includes('CALABARZON') || r.includes('MIMAROPA') || r.includes('BICOL') || p.includes('PALAWAN')) {
        spxRegion = 'South Luzon';
    } else if (r.includes('REGION VI') || r.includes('REGION VII') || r.includes('REGION VIII') || r.includes('WESTERN VISAYAS') || r.includes('CENTRAL VISAYAS') || r.includes('EASTERN VISAYAS')) {
        spxRegion = 'Visayas';
    } else if (r.includes('REGION IX') || r.includes('REGION X') || r.includes('REGION XI') || r.includes('REGION XII') || r.includes('REGION XIII') || r.includes('BARMM') || r.includes('MINDANAO')) {
        spxRegion = 'Mindanao';
    }
    
    return { spxRegion, spxProvince, spxCity: fixMetroManilaCity(city || ''), spxBarangay: formatBarangay(barangay || '') };
  };

  const handleExportExcel = async () => {
    if (orders.length === 0) return;
    
    try {
      setLoading(true);
      
      const headers = [
        '*Order Number', '*Recipient Name', '*Recipient Phone', '*Detailed Address',
        'Region', 'Province', 'Town/City', 'Barangay', 'Postal Code',
        '*Item Name', '*Item Type', 'Item Quantity', 'Item Price',
        '*Parcel Weight (KG)', '*Parcel Length (CM)', '*Parcel Width (CM)', '*Parcel Height (CM)',
        'Customer Reference No.', '*Payment Method', 'Delivery Instruction',
        '*COD Collection (Y/N)', 'COD Amount', '*Parcel Value (PHP)'
      ];

      const rows: any[][] = [headers];

      orders.forEach(order => {
        const items = order.items.length > 0 ? order.items : [{ product_name: 'Item', quantity: 1, selling_price_at_sale: order.totalAmount, discount: 0 }];
        
        const balanceDue = order.totalAmount - order.amountPaid;
        const codAmount = balanceDue > 0 ? balanceDue + order.shippingAmount : 0;
        const isCOD = codAmount > 0;
        
        const addr = order.shippingAddress || {};
        const detailedAddress = addr.address_line || addr.street_address || 'N/A';
        
        const { spxRegion, spxProvince, spxCity, spxBarangay } = mapToSPXAddress(addr.region || '', addr.province || '', addr.city || '', addr.barangay || '');

        if (order.boxesConfig && Array.isArray(order.boxesConfig) && order.boxesConfig.length > 1) {
            order.boxesConfig.forEach((box: any, index: number) => {
                const itemNames = (box.items || []).map((i: any) => `${i.quantity}x ${i.product_name}`).join(', ');
                const totalQuantity = (box.items || []).reduce((acc: number, i: any) => acc + (Number(i.quantity) || 1), 0);
                const consolidatedName = itemNames.length > 100 ? itemNames.substring(0, 97) + '...' : itemNames;
                const codAmount = box.cod_amount || 0;
                
                const rowData = [
                  `${order.orderId}-B${index + 1}`, // *Order Number
                  order.shippingName, // *Recipient Name
                  order.shippingPhone, // *Recipient Phone
                  detailedAddress, // *Detailed Address
                  spxRegion, // Region
                  spxProvince, // Province
                  spxCity, // Town/City
                  spxBarangay, // Barangay
                  addr.postal_code || '0000', // Postal Code
                  consolidatedName || 'Assorted Items', // *Item Name
                  'General merchandise', // *Item Type
                  totalQuantity, // Item Quantity
                  order.totalAmount, // Item Price
                  box.weight || 1, // *Parcel Weight (KG)
                  box.length || 10, // *Parcel Length (CM)
                  box.width || 10, // *Parcel Width (CM)
                  box.height || 10, // *Parcel Height (CM)
                  `ORDER #${order.orderId}-B${index + 1}`, // Customer Reference No.
                  'Sender Pay', // *Payment Method
                  order.deliveryInstructions || '', // Delivery Instruction
                  codAmount > 0 ? 'Y' : 'N', // *COD Collection (Y/N)
                  codAmount, // COD Amount
                  order.totalAmount // *Parcel Value (PHP)
                ];
                rows.push(rowData);
            });
        } else {
            // Consolidate items into one row
            const itemNames = items.map((i: any) => `${i.quantity}x ${i.product_name}`).join(', ');
            const totalQuantity = items.reduce((acc: number, i: any) => acc + (Number(i.quantity) || 1), 0);
            const consolidatedName = itemNames.length > 100 ? itemNames.substring(0, 97) + '...' : itemNames;

            const rowData = [
              order.orderId, // *Order Number
              order.shippingName, // *Recipient Name
              order.shippingPhone, // *Recipient Phone
              detailedAddress, // *Detailed Address
              spxRegion, // Region
              spxProvince, // Province
              spxCity, // Town/City
              spxBarangay, // Barangay
              addr.postal_code || '0000', // Postal Code
              consolidatedName, // *Item Name
              'General merchandise', // *Item Type
              totalQuantity, // Item Quantity
              order.totalAmount, // Item Price
              order.weight || 1, // *Parcel Weight (KG)
              order.length || 10, // *Parcel Length (CM)
              order.width || 10, // *Parcel Width (CM)
              order.height || 10, // *Parcel Height (CM)
              `ORDER #${order.orderId}`, // Customer Reference No.
              'Sender Pay', // *Payment Method
              order.deliveryInstructions || '', // Delivery Instruction
              isCOD ? 'Y' : 'N', // *COD Collection (Y/N)
              codAmount, // COD Amount
              order.totalAmount // *Parcel Value (PHP)
            ];
            
            rows.push(rowData);
        }
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `For_Shipping_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
      
    } catch (error) {
      console.error("Failed to generate Excel file:", error);
    } finally {
      setLoading(false);
    }
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
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleSPXUpload} 
                accept=".xlsx, .xls" 
                className="hidden" 
              />
              <Button onClick={() => fileInputRef.current?.click()} disabled={loading} variant="outline" className="border-primary text-primary hover:bg-primary/10">
                <Upload className="mr-2 h-4 w-4" /> Sync SPX File
              </Button>
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
