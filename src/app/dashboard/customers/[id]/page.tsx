'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LogPaymentDialog } from '@/components/dashboard/log-payment-dialog';
import { format } from 'date-fns';
import { type Order } from '@/app/dashboard/orders/page';
import { Badge } from '@/components/ui/badge';
import { AddCustomerDialog } from '@/components/dashboard/add-customer-dialog';
import { Pencil } from 'lucide-react';

type Customer = {
  id: string;
  fullName: string;
  email: string;
  mobileNumber?: string;
  addressLine?: string;
  region?: string;
  province?: string;
  city?: string;
  barangay?: string;
  postalCode?: string;
  streetAddress?: string;
  sukiTier?: string;
  facebookProfileLink?: string;
  storeCredit?: number;
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
      case 'Waiting for Stock':
        return 'outline';
      case 'Processing':
      case 'On-Hold':
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
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!supabase || !customerId) return;
    const fetchAll = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch customer
        const { data: custData, error: custErr } = await supabase
          .from('customers')
          .select('*')
          .eq('id', customerId)
          .single();
        if (custErr) throw custErr;
        if (custData) {
          setCustomer({
            id: custData.id,
            fullName: custData.full_name,
            email: custData.email,
            mobileNumber: custData.mobile_number,
            addressLine: custData.address_line,
            region: custData.region,
            province: custData.province,
            city: custData.city,
            barangay: custData.barangay,
            postalCode: custData.postal_code,
            streetAddress: custData.street_address,
            sukiTier: custData.suki_tier,
            facebookProfileLink: custData.facebook_profile_link,
            storeCredit: custData.store_credit,
          });
        }

        // 2. Fetch this customer's orders only (server-side filter)
        const { data: ordersData, error: ordersErr } = await supabase
          .from('orders')
          .select('*')
          .eq('customer_id', customerId)
          .order('order_date', { ascending: false });
        if (ordersErr) throw ordersErr;
        const mappedOrders: Order[] = (ordersData || []).map((o: any) => ({
          id: o.id,
          customerId: o.customer_id,
          orderDate: o.order_date,
          orderStatus: o.status,
          totalAmount: o.total_amount,
          balanceDue: o.balance_due,
          amountPaid: o.amount_paid,
          subtotal: o.subtotal,
          totalDiscount: o.total_discount,
          paymentType: o.payment_type,
          installmentMonths: o.installment_months,
          monthlyPayment: o.monthly_payment,
          salesPersonName: o.sales_person_name,
          salesRepId: o.sales_rep_id,
          insurance_fee: o.insurance_fee,
          tracking_number: o.tracking_number,
          spx_sync_data: o.spx_sync_data,
        }));
        setOrders(mappedOrders);

        // 3. Fetch payments only for those orders
        if (mappedOrders.length > 0) {
          const orderIds = mappedOrders.map(o => o.id);
          const { data: paymentsData, error: paymentsErr } = await supabase
            .from('payments')
            .select('*')
            .in('order_id', orderIds)
            .order('payment_date', { ascending: false });
          if (paymentsErr) throw paymentsErr;
          setPayments((paymentsData || []).map((p: any) => ({
            id: p.id,
            orderId: p.order_id,
            paymentDate: p.payment_date,
            amount: p.amount,
            paymentMethod: p.payment_method,
          })));
        } else {
          setPayments([]);
        }
      } catch (err) {
        console.error('CustomerDetailPage fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAll();
  }, [supabase, customerId, refreshKey]);

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
              <AvatarFallback className="text-2xl">{(customer.fullName?.[0] || 'U').toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle className="text-3xl font-headline">{customer.fullName || 'Unnamed Customer'}</CardTitle>
              <div className="flex flex-col gap-1 mt-2 mb-4 text-sm text-muted-foreground">
                {customer.email && <div className="flex items-center gap-2"><span>✉️</span> {customer.email}</div>}
                {customer.mobileNumber && <div className="flex items-center gap-2"><span>📱</span> {customer.mobileNumber}</div>}
                
                {/* Address Display */}
                {customer.region || customer.province ? (
                  <div className="flex items-start gap-2">
                    <span>📍</span> 
                    <div>
                      <div>{customer.streetAddress && `${customer.streetAddress}, `}{customer.barangay}</div>
                      <div>{customer.city}, {customer.province}</div>
                      <div className="text-xs opacity-75">{customer.region} {customer.postalCode}</div>
                    </div>
                  </div>
                ) : customer.addressLine ? (
                  <div className="flex items-center gap-2"><span>📍</span> {customer.addressLine}</div>
                ) : null}
                
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
              <CardDescription className="text-base mt-2">
                Total Outstanding Balance: <span className="font-bold text-destructive">₱{Number(totalBalanceOwed || 0).toFixed(2)}</span>
              </CardDescription>
              {customer.storeCredit && Number(customer.storeCredit) > 0 ? (
                <CardDescription className="text-base mt-1 text-green-600 font-semibold">
                  Store Credit (Overpayment): ₱{Number(customer.storeCredit || 0).toFixed(2)}
                </CardDescription>
              ) : null}
            </div>
            <div className="self-start">
              <Button variant="outline" size="sm" onClick={() => setEditingCustomer(customer)}>
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </Button>
            </div>
          </CardHeader>
        </Card>
        
        {editingCustomer && (
          <AddCustomerDialog
            open={!!editingCustomer}
            onOpenChange={(open) => !open && setEditingCustomer(null)}
            customerToEdit={editingCustomer}
            onSuccess={() => {
                setEditingCustomer(null);
                setRefreshKey(prev => prev + 1);
            }}
          />
        )}
        
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
                    <TableCell>{order.orderDate ? format(new Date(order.orderDate), 'PPP') : 'N/A'}</TableCell>
                    <TableCell>₱{Number(order.totalAmount || 0).toFixed(2)}</TableCell>
                    <TableCell className="font-semibold">₱{Number(order.balanceDue || 0).toFixed(2)}</TableCell>
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
                  <TableHead>Assigned Agent</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length > 0 ? orders.map(order => (
                  <TableRow key={order.id}>
                    <TableCell>{order.orderDate ? format(new Date(order.orderDate), 'PPP') : 'N/A'}</TableCell>
                    <TableCell><Badge variant={getStatusVariant(order.orderStatus)}>{order.orderStatus}</Badge></TableCell>
                    <TableCell>{order.salesPersonName || 'Unassigned'}</TableCell>
                    <TableCell className="text-right">₱{Number(order.totalAmount || 0).toFixed(2)}</TableCell>
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
                    <TableCell>{payment.paymentDate ? format(new Date(payment.paymentDate), 'PPP p') : 'N/A'}</TableCell>
                    <TableCell>{payment.paymentMethod}</TableCell>
                    <TableCell className="text-right font-medium">₱{Number(payment.amount || 0).toFixed(2)}</TableCell>
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
            onSuccess={() => {
                setLogPaymentOrder(null);
                setRefreshKey(prev => prev + 1);
            }}
        />
      )}
    </>
  );
}
