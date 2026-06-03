'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDoc, useCollection, useSupabase, useUser, collection, doc, query, orderBy } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LogPaymentDialog } from '@/components/dashboard/log-payment-dialog';
import { format } from 'date-fns';
import { type Order } from '@/app/dashboard/orders/page';
import { Badge } from '@/components/ui/badge';

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber?: string;
  addressLine?: string;
  sukiTier?: string;
  facebookProfileLink?: string;
};

type Payment = {
  id: string;
  orderId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
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

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = params.id as string;
  const supabase = useSupabase();
  const router = useRouter();

  const [logPaymentOrder, setLogPaymentOrder] = useState<Order | null>(null);
  
  // Fetch customer
  const customerRef = useMemo(() => (supabase && customerId ? doc(supabase, 'customers', customerId) : null), [supabase, customerId]);
  const { data: customer, isLoading: isLoadingCustomer } = useDoc<Customer>(customerRef);
  
  // Fetch ALL orders and payments, then filter on the client
  const allOrdersQuery = useMemo(() => (supabase ? query(collection(supabase, 'orders'), orderBy('orderDate', 'desc')) : null), [supabase]);
  const { data: allOrders, isLoading: isLoadingOrders } = useCollection<Order>(allOrdersQuery);

  const allPaymentsQuery = useMemo(() => (supabase ? query(collection(supabase, 'payments'), orderBy('paymentDate', 'desc')) : null), [supabase]);
  const { data: allPayments, isLoading: isLoadingPayments } = useCollection<Payment>(allPaymentsQuery);

  const isLoading = isLoadingCustomer || isLoadingOrders || isLoadingPayments;

  // Client-side filtering for orders
  const orders = useMemo(() => {
    if (!allOrders || !customerId) return [];
    return allOrders.filter(o => o.customerId === customerId);
  }, [allOrders, customerId]);
  
  const orderIds = useMemo(() => orders.map(o => o.id), [orders]);

  // Client-side filtering for payments
  const payments = useMemo(() => {
    if (!allPayments || orderIds.length === 0) return [];
    const orderIdSet = new Set(orderIds);
    return allPayments.filter(p => orderIdSet.has(p.orderId));
  }, [allPayments, orderIds]);

  const { totalBalanceOwed, outstandingOrders } = useMemo(() => {
    if (!orders) return { totalBalanceOwed: 0, outstandingOrders: [] };
    const outstanding = orders.filter(o => o.balanceDue > 0 && o.orderStatus !== 'Cancelled' && o.orderStatus !== 'Returned');
    const total = outstanding.reduce((sum, o) => sum + o.balanceDue, 0);
    return { totalBalanceOwed: total, outstandingOrders: outstanding };
  }, [orders]);
  
  if (isLoading) {
    return null; // Handled by loading.tsx
  }

  if (!customer) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Customer Not Found</CardTitle>
                <CardDescription>The requested customer could not be found.</CardDescription>
            </CardHeader>
        </Card>
    );
  }
  
  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-2xl">{customer.firstName[0]}{customer.lastName[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle className="text-3xl font-headline">{customer.firstName} {customer.lastName}</CardTitle>
              <div className="flex flex-col gap-1 mt-2 mb-4 text-sm text-muted-foreground">
                {customer.email && <div className="flex items-center gap-2"><span>✉️</span> {customer.email}</div>}
                {customer.mobileNumber && <div className="flex items-center gap-2"><span>📱</span> {customer.mobileNumber}</div>}
                {customer.addressLine && <div className="flex items-center gap-2"><span>📍</span> {customer.addressLine}</div>}
                {customer.facebookProfileLink && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[#1877F2]" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 8 19">
                        <path fillRule="evenodd" d="M6.135 3H8V0H6.135a4.147 4.147 0 0 0-4.142 4.142V6H0v3h2v9.938h3V9h2.021l.592-3H5V3.591A.6.6 0 0 1 5.592 3h.543Z" clipRule="evenodd"/>
                    </svg>
                    <a href={customer.facebookProfileLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      Facebook Profile
                    </a>
                  </div>
                )}
              </div>
              <CardDescription className="text-base">
                Total Outstanding Balance: <span className="font-bold text-destructive">₱{totalBalanceOwed.toFixed(2)}</span>
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
        
        {/* Outstanding Balances Section */}
        <Card>
          <CardHeader>
            <CardTitle>Outstanding Balances</CardTitle>
            <CardDescription>All active orders with a remaining balance.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Balance Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstandingOrders.length > 0 ? outstandingOrders.map(order => (
                  <TableRow key={order.id}>
                    <TableCell>{format(new Date(order.orderDate), 'PPP')}</TableCell>
                    <TableCell>₱{order.totalAmount.toFixed(2)}</TableCell>
                    <TableCell className="font-semibold">₱{order.balanceDue.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => setLogPaymentOrder(order)}>Log Payment</Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center">No outstanding balances.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        
        {/* Order History Section */}
        <Card>
          <CardHeader>
            <CardTitle>Order History</CardTitle>
            <CardDescription>A complete log of all orders from this customer.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length > 0 ? orders.map(order => (
                  <TableRow key={order.id}>
                    <TableCell>{format(new Date(order.orderDate), 'PPP')}</TableCell>
                    <TableCell><Badge variant={getStatusVariant(order.orderStatus)}>{order.orderStatus}</Badge></TableCell>
                    <TableCell className="text-right">₱{order.totalAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/orders/${order.id}`)}>
                        View Order
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center">No orders found.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Payment History Section */}
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>A complete log of all payments received from this customer.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments && payments.length > 0 ? payments.map(payment => (
                  <TableRow key={payment.id}>
                    <TableCell>{format(new Date(payment.paymentDate), 'PPP p')}</TableCell>
                    <TableCell>{payment.paymentMethod}</TableCell>
                    <TableCell className="text-right font-medium">₱{payment.amount.toFixed(2)}</TableCell>
                  </TableRow>
                )) : (
                   <TableRow><TableCell colSpan={3} className="h-24 text-center">No payments recorded.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {logPaymentOrder && (
        <LogPaymentDialog 
            order={logPaymentOrder}
            open={!!logPaymentOrder}
            onOpenChange={(isOpen) => !isOpen && setLogPaymentOrder(null)}
        />
      )}
    </>
  );
}
