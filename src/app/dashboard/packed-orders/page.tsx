'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useSupabase } from '@/firebase';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { format, differenceInDays } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VerifyShippingDialog } from '@/components/dashboard/verify-shipping-dialog';
import { NotForShippingDialog } from '@/components/dashboard/not-for-shipping-dialog';
import { Order } from '@/app/dashboard/orders/page';

type PackedOrder = Order & {
  customerName: string;
  daysPacked: number;
};

export default function PackedOrdersPage() {
  const supabase = useSupabase();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSalesPerson, setFilterSalesPerson] = useState<string>('All');
  
  const [verifyOrder, setVerifyOrder] = useState<Order | null>(null);
  const [notForShippingOrder, setNotForShippingOrder] = useState<Order | null>(null);

  const [rawOrders, setRawOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const refetchOrders = () => setRefetchTrigger(n => n + 1);

  useEffect(() => {
    if (!supabase) return;
    const fetch = async () => {
      setIsLoadingOrders(true);
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('status', 'Packed')
          .order('order_date', { ascending: false });
        if (error) throw error;
        setRawOrders((data || []).map((o: any) => ({
          id: o.id,
          customerId: o.customer_id,
          orderDate: o.order_date,
          status: o.status,
          totalAmount: o.total_amount,
          discountAmount: o.discount_amount,
          paymentMethod: o.payment_method,
          courierName: o.courier_name,
          shippingFee: o.shipping_fee,
          deliveryAddress: o.delivery_address,
          contactNumber: o.contact_number,
          trackingNumber: o.tracking_number,
          proofOfPayment: o.proof_of_payment,
          paymentDetails: o.payment_details,
          notes: o.notes,
          salesRepId: o.sales_rep_id,
          salesPersonName: o.sales_person_name,
          not_for_shipping_reason: o.not_for_shipping_reason,
          boxes_config: o.boxes_config,
        })));
      } catch (err) { console.error('Packed orders fetch error:', err); }
      finally { setIsLoadingOrders(false); }
    };
    fetch();
  }, [supabase, refetchTrigger]);

  const [customerMap, setCustomerMap] = useState<Map<string, string>>(new Map());
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);

  // Fetch customers for the packed orders
  useMemo(() => {
    if (!rawOrders || rawOrders.length === 0 || !supabase) return;
    const fetchCustomers = async () => {
      setIsLoadingCustomers(true);
      try {
        const customerIds = Array.from(new Set(rawOrders.map(o => o.customerId)));
        const { data, error } = await supabase.from('customers').select('id, full_name').in('id', customerIds);
        if (error) throw error;
        const map = new Map<string, string>();
        if (data) data.forEach(c => map.set(c.id, c.full_name || 'Unknown'));
        setCustomerMap(map);
      } catch (err) {
        console.error('Error fetching customers:', err);
      } finally {
        setIsLoadingCustomers(false);
      }
    };
    fetchCustomers();
  }, [rawOrders, supabase]);

  const isLoading = isLoadingOrders || isLoadingCustomers;

  // Enhance orders with customer name and days packed
  const formattedOrders: PackedOrder[] = useMemo(() => {
    if (!rawOrders) return [];
    let filtered = rawOrders;
    
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(o => 
        (o.id || '').toLowerCase().includes(q) ||
        (customerMap.get(o.customerId) || '').toLowerCase().includes(q)
      );
    }

    if (filterSalesPerson !== 'All') {
      filtered = filtered.filter((o: any) => o.salesPersonName === filterSalesPerson);
    }

    return filtered.map(order => ({
      ...order,
      customerName: customerMap.get(order.customerId) || 'Unknown Customer',
      daysPacked: differenceInDays(new Date(), new Date(order.orderDate))
    }));
  }, [rawOrders, customerMap, searchQuery, filterSalesPerson]);

  const uniqueSalesPersons = Array.from(new Set(rawOrders.map((o: any) => o.salesPersonName).filter(Boolean))).sort() as string[];

  // Split into Ready and Waiting
  const readyOrders = formattedOrders.filter(o => !(o as any).not_for_shipping_reason);
  const waitingOrders = formattedOrders.filter(o => !!(o as any).not_for_shipping_reason);

  const renderTable = (ordersToRender: PackedOrder[], isWaitingTab: boolean) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order ID</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Sales Rep</TableHead>
          <TableHead>Packed Date</TableHead>
          {isWaitingTab && <TableHead>Reason</TableHead>}
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            {isWaitingTab && <TableCell><Skeleton className="h-4 w-48" /></TableCell>}
            <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
          </TableRow>
        ))}
        {!isLoading && ordersToRender.length === 0 && (
          <TableRow>
            <TableCell colSpan={isWaitingTab ? 6 : 5} className="text-center py-12 text-muted-foreground">
              No orders found in this category.
            </TableCell>
          </TableRow>
        )}
        {!isLoading && ordersToRender.map(order => (
          <TableRow key={order.id}>
            <TableCell className="font-mono text-sm">{order.id.split('-')[0].toUpperCase()}</TableCell>
            <TableCell className="font-medium">{order.customerName}</TableCell>
            <TableCell className="text-muted-foreground text-sm">{(order as any).salesPersonName || '-'}</TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span>{format(new Date(order.orderDate), 'MMM d, yyyy')}</span>
                <span className={order.daysPacked > 3 ? 'text-amber-600 text-xs font-semibold' : 'text-xs text-muted-foreground'}>
                  {order.daysPacked} days ago
                </span>
              </div>
            </TableCell>
            {isWaitingTab && (
              <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate" title={(order as any).not_for_shipping_reason}>
                {(order as any).not_for_shipping_reason}
              </TableCell>
            )}
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setNotForShippingOrder(order)} className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Not for shipping">
                  <XCircle className="h-4 w-4 mr-1" /> Delay
                </Button>
                <Button variant="default" size="sm" onClick={() => setVerifyOrder(order)} className="bg-emerald-600 hover:bg-emerald-700" title="Verify for shipping">
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Verify
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <CardTitle className="font-headline">Packed Orders</CardTitle>
              <CardDescription>
                Review freshly packed orders, verify their shipping details, and send them to the "For Shipping" queue.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search order ID or customer..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={filterSalesPerson} onValueChange={setFilterSalesPerson}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Sales" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Sales Reps</SelectItem>
                {uniqueSalesPersons.map(sp => (
                  <SelectItem key={sp} value={sp}>{sp}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs defaultValue="ready" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="ready">
                Ready to Verify <Badge variant="secondary" className="ml-2 bg-background">{readyOrders.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="waiting">
                Waiting to be Shipped <Badge variant="secondary" className="ml-2 bg-background">{waitingOrders.length}</Badge>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="ready">
              {renderTable(readyOrders, false)}
            </TabsContent>
            <TabsContent value="waiting">
              {renderTable(waitingOrders, true)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <VerifyShippingDialog 
        order={verifyOrder} 
        open={!!verifyOrder} 
        onOpenChange={(open) => !open && setVerifyOrder(null)} 
        onSuccess={refetchOrders} 
      />
      <NotForShippingDialog 
        order={notForShippingOrder} 
        open={!!notForShippingOrder} 
        onOpenChange={(open) => !open && setNotForShippingOrder(null)} 
        onSuccess={refetchOrders} 
      />
    </>
  );
}
