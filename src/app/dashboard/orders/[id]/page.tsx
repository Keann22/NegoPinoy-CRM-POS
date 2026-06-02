'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useDoc, useCollection, useSupabase, where, collection, doc, query } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { type Order } from '@/app/dashboard/orders/page';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Share2, Edit } from 'lucide-react';
import { ShareReceiptDialog } from '@/components/dashboard/share-receipt-dialog';
import { EditOrderDialog } from '@/components/dashboard/order-dialog';
import { MarkShippedDialog } from '@/components/dashboard/mark-shipped-dialog';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Truck } from 'lucide-react';

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

type Product = {
    id: string;
    name: string;
}

type OrderItem = {
    id: string;
    orderId: string;
    productId: string;
    productName?: string;
    quantity: number;
    costPriceAtSale: number;
    sellingPriceAtSale: number;
    discount?: number;
    shelfLocation?: string;
}

type Payment = {
  id: string;
  orderId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  notes?: string;
  proofUrl?: string;
}

const getStatusVariant = (status: Order['orderStatus']) => {
    switch (status) {
      case 'Shipped':
      case 'Completed':
        return 'outline';
      case 'Processing':
        return 'secondary';
      case 'Cancelled':
      case 'Returned':
          return 'destructive';
      case 'Pending Payment':
      default:
        return 'default';
    }
  }

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = params.id as string;
  const supabase = useSupabase();

  const orderRef = useMemo(() => (supabase && orderId ? doc(supabase, 'orders', orderId) : null), [supabase, orderId]);
  const { data: order, isLoading: isLoadingOrder } = useDoc<Order>(orderRef);

  const customerRef = useMemo(() => (supabase && order?.customerId ? doc(supabase, 'customers', order.customerId) : null), [supabase, order]);
  const { data: customer, isLoading: isLoadingCustomer } = useDoc<Customer>(customerRef);

  const orderItemsQuery = useMemo(() => (supabase && orderId ? query(collection(supabase, 'orderItems'), where('orderId', '==', orderId)) : null), [supabase, orderId]);
  const { data: allOrderItems, isLoading: isLoadingOrderItems } = useCollection<OrderItem>(orderItemsQuery);
  
  const paymentsQuery = useMemo(() => (supabase && orderId ? query(collection(supabase, 'payments'), where('orderId', '==', orderId)) : null), [supabase, orderId]);
  const { data: allPayments, isLoading: isLoadingPayments } = useCollection<Payment>(paymentsQuery);

  const [productMap, setProductMap] = useState<Map<string, { name: string, location: string }>>(new Map());
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isShareReceiptOpen, setIsShareReceiptOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMarkShippedOpen, setIsMarkShippedOpen] = useState(false);

  const { userProfile } = useUserProfile();

  useEffect(() => {
    if (!allOrderItems || allOrderItems.length === 0 || !supabase) return;
    
    const fetchProducts = async () => {
      setIsLoadingProducts(true);
      try {
        const productIds = Array.from(new Set(allOrderItems.map(item => item.productId)));
        const map = new Map<string, string>();
        
        const { data, error } = await supabase
          .from('products')
          .select('id, name, shelf_location')
          .in('id', productIds);
          
        if (error) throw error;
        
        if (data) {
          data.forEach(p => {
             map.set(p.id, { name: p.name || 'Unknown Product', location: p.shelf_location || '' });
          });
        }
        setProductMap(map);
      } catch (err) {
        console.error('Error fetching products for order items:', err);
      } finally {
        setIsLoadingProducts(false);
      }
    };
    
    fetchProducts();
  }, [allOrderItems, supabase]);

  // Auto-open share receipt if URL has ?share=true
  useEffect(() => {
    const shareParam = searchParams.get('share');
    if (shareParam === 'true' && order) {
        setIsShareReceiptOpen(true);
        // Clean up URL without triggering a full page navigation
        window.history.replaceState(null, '', `/dashboard/orders/${order.id}`);
    }
  }, [searchParams, order]);

  const isLoading = isLoadingOrder || isLoadingCustomer || isLoadingOrderItems || isLoadingPayments || isLoadingProducts;

  const orderItems = useMemo(() => {
    if (!allOrderItems || !orderId) return [];
    return allOrderItems
        .map(item => {
            const productData = productMap.get(item.productId) || { name: 'Unknown Product', location: '' };
            return {
                ...item,
                productName: productData.name,
                shelfLocation: productData.location
            };
        });
  }, [allOrderItems, orderId, productMap]);

  const payments = useMemo(() => {
    if (!allPayments || !orderId) return [];
    return [...allPayments].sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
  }, [allPayments, orderId]);

  const canEdit = userProfile?.roles?.includes('Admin') || 
                  userProfile?.roles?.includes('Owner') || 
                  (order?.orderStatus !== 'Completed' && order?.orderStatus !== 'Shipped');

  if (isLoading) {
    return null; // Handled by loading.tsx
  }

  if (!order) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Order Not Found</CardTitle>
                <CardDescription>The requested order could not be found.</CardDescription>
            </CardHeader>
        </Card>
    );
  }
  
  return (
    <div className="space-y-6">
       <Button variant="outline" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Orders
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-headline">Order #{order.id.substring(0, 7).toUpperCase()}</CardTitle>
              <CardDescription>
                Placed on {format(new Date(order.orderDate), 'PPP')}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-4 sm:mt-0">
                {(order.orderStatus === 'Processing' || order.orderStatus === 'Pending Payment' || order.orderStatus === 'Shipped') && (
                    <Button variant="secondary" size="sm" onClick={() => setIsMarkShippedOpen(true)}>
                        <Truck className="mr-2 h-4 w-4" />
                        {order.orderStatus === 'Shipped' ? 'Update Tracking' : 'Mark Shipped'}
                    </Button>
                )}
                {canEdit && (
                    <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Order
                    </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setIsShareReceiptOpen(true)}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share Receipt
                </Button>
                <Badge variant={getStatusVariant(order.orderStatus)} className="text-base">
                    {order.orderStatus}
                </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Customer</p>
            {customer ? (
                <Link href={`/dashboard/customers/${customer.id}`} className="font-semibold text-primary hover:underline block">
                    {customer.firstName} {customer.lastName}
                </Link>
            ) : (
                <p className="font-semibold">Loading...</p>
            )}
            <p className="text-sm text-muted-foreground">{customer?.email}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Payment Type</p>
            <p className="font-semibold">{order.paymentType}</p>
            {order.paymentType === 'Installment' && (
                <div className="text-sm text-muted-foreground mt-1">
                    <p>{order.installmentMonths} months</p>
                    {order.monthlyPayment && (
                        <p>₱{order.monthlyPayment.toFixed(2)} / month</p>
                    )}
                </div>
            )}
          </div>
          {order.tracking_number && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Tracking Number</p>
              <p className="font-semibold">{order.tracking_number}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Order Items</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Line Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderItems.length > 0 ? orderItems.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{item.shelfLocation || '-'}</TableCell>
                  <TableCell className="text-center">{item.quantity}</TableCell>
                  <TableCell className="text-right">₱{item.sellingPriceAtSale.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-destructive">- ₱{(item.discount || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-medium">₱{((item.sellingPriceAtSale - (item.discount || 0)) * item.quantity).toFixed(2)}</TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={6} className="h-24 text-center">No items found for this order.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <div className="grid gap-6 md:grid-cols-5">
        <Card className="md:col-span-3">
            <CardHeader><CardTitle>Payment History</CardTitle></CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {payments.length > 0 ? payments.map(p => (
                            <TableRow key={p.id}>
                                <TableCell>
                                    {format(new Date(p.paymentDate), 'PPp')}
                                    {p.proofUrl && (
                                        <div className="mt-1">
                                            <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline inline-flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                                                View Proof
                                            </a>
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell>{p.paymentMethod}</TableCell>
                                <TableCell className="text-right font-medium">₱{p.amount.toFixed(2)}</TableCell>
                            </TableRow>
                        )) : (
                            <TableRow><TableCell colSpan={3} className="h-24 text-center">No payments logged yet.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        <Card className="md:col-span-2">
            <CardHeader><CardTitle>Financial Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>₱{order.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="text-destructive">- ₱{(order.totalDiscount || 0).toFixed(2)}</span>
                </div>
                {order.insurance_fee ? (
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Insurance Fee (1%)</span>
                        <span>+ ₱{order.insurance_fee.toFixed(2)}</span>
                    </div>
                ) : null}
                {order.paymentType === 'Installment' && order.totalAmount > (order.subtotal - (order.totalDiscount || 0) + (order.insurance_fee || 0)) && (
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">System Adjustment</span>
                        <span className="text-muted-foreground">+ ₱{(order.totalAmount - (order.subtotal - (order.totalDiscount || 0) + (order.insurance_fee || 0))).toFixed(2)}</span>
                    </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-base">
                    <span>Total</span>
                    <span>₱{order.totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount Paid</span>
                    <span>₱{order.amountPaid.toFixed(2)}</span>
                </div>
                 <div className="flex justify-between font-semibold text-base">
                    <span>Balance Due</span>
                    <span>₱{order.balanceDue.toFixed(2)}</span>
                </div>
            </CardContent>
        </Card>
      </div>

      {order && customer && (
        <ShareReceiptDialog
          open={isShareReceiptOpen}
          onOpenChange={setIsShareReceiptOpen}
          order={order}
          customer={customer}
          orderItems={orderItems}
          payments={payments}
        />
      )}
      {order && (
        <MarkShippedDialog
          open={isMarkShippedOpen}
          onOpenChange={setIsMarkShippedOpen}
          orderId={order.id}
          currentTrackingNumber={order.tracking_number || ''}
          onSuccess={() => {
            setIsMarkShippedOpen(false);
          }}
        />
      )}
      {order && (
        <EditOrderDialog 
            open={isEditOpen} 
            onOpenChange={setIsEditOpen} 
            order={order} 
            orderItems={orderItems} 
        />
      )}
    </div>
  );
}
