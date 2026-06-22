'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useSupabase } from '@/lib/supabase/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle, Edit, FileText, Share2, Truck, Activity } from 'lucide-react';
import { ShareReceiptDialog } from '@/components/dashboard/share-receipt-dialog';
import { EditOrderDialog } from '@/components/dashboard/order-dialog';
import { MarkShippedDialog } from '@/components/dashboard/mark-shipped-dialog';
import { WaybillSummaryDialog } from '@/components/dashboard/waybill-summary-dialog';
import { OrderTrailDialog } from '@/components/dashboard/order-trail-dialog';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import type { Order, OrderStatus } from '@/types';

type StatusVariant = 'outline' | 'secondary' | 'destructive' | 'default';

function getStatusVariant(status: OrderStatus): StatusVariant {
  switch (status) {
    case 'Shipped': case 'Completed': case 'For Pick-up':
      return 'outline';
    case 'Processing': case 'On-Hold':
      return 'secondary';
    case 'Cancelled': case 'Returned':
      return 'destructive';
    case 'Waiting for Stock':
      return 'outline';
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

  const { order, customer, orderItems: rawItems, payments: rawPayments, isLoading, refetch } = useOrderDetail(orderId);
  const { userProfile } = useUserProfile();

  // Dialog state
  const [isShareReceiptOpen, setIsShareReceiptOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMarkShippedOpen, setIsMarkShippedOpen] = useState(false);
  const [isWaybillOpen, setIsWaybillOpen] = useState(false);
  const [isTrailOpen, setIsTrailOpen] = useState(false);

  // Expenses (Shipping and Processing)
  const [shippingFee, setShippingFee] = useState<number>(0);
  const [processingFee, setProcessingFee] = useState<number>(0);

  useEffect(() => {
    if (!supabase || !orderId) return;
    supabase.from('expenses')
      .select('amount, category')
      .ilike('description', `%${orderId.substring(0, 7).toUpperCase()}%`)
      .then(({ data }) => {
        if (data && data.length > 0) {
          let ship = 0;
          let proc = 0;
          data.forEach((d: any) => {
            if (d.category === 'Shipping Fee') ship += d.amount;
            else proc += d.amount;
          });
          setShippingFee(ship);
          setProcessingFee(proc);
        }
      });
  }, [supabase, orderId]);

  // Auto-open share receipt if URL has ?share=true
  useEffect(() => {
    if (searchParams.get('share') === 'true' && order) {
      setIsShareReceiptOpen(true);
      window.history.replaceState(null, '', `/dashboard/orders/${order.id}`);
    }
  }, [searchParams, order]);

  // Sorted payments
  const payments = useMemo(() =>
    [...rawPayments].sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()),
    [rawPayments]
  );

  const canEdit = userProfile?.roles?.some(r => ['Admin', 'Owner', 'Sales'].includes(r)) ||
    (order?.orderStatus !== 'Completed' && order?.orderStatus !== 'Shipped');

  if (isLoading) return null;

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
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Orders
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-headline">Order #{order.id.substring(0, 7).toUpperCase()}</CardTitle>
              <CardDescription>Placed on {format(new Date(order.orderDate), 'PPP')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-4 sm:mt-0">
              {(order.orderStatus === 'Processing' || order.orderStatus === 'Pending Payment' || order.orderStatus === 'Shipped') && (
                <Button variant="secondary" size="sm" onClick={() => setIsMarkShippedOpen(true)}>
                  <Truck className="mr-2 h-4 w-4" />
                  {order.orderStatus === 'Shipped' ? 'Update Tracking' : 'Mark Shipped'}
                </Button>
              )}
              {order.orderStatus === 'Shipped' && (
                <Button variant="default" size="sm" onClick={async () => {
                  const { error } = await supabase.from('orders').update({ status: 'Completed', completed_at: new Date().toISOString() }).eq('id', order.id);
                  if (!error) window.location.reload();
                }}>
                  <CheckCircle className="mr-2 h-4 w-4" /> Mark as Completed
                </Button>
              )}
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
                  <Edit className="mr-2 h-4 w-4" /> Edit Order
                </Button>
              )}
              {(order.orderStatus === 'For Pick-up' || order.orderStatus === 'Shipped' || order.orderStatus === 'Completed') && order.spx_sync_data && (
                <Button variant="outline" size="sm" onClick={() => setIsWaybillOpen(true)}>
                  <FileText className="mr-2 h-4 w-4" /> View Waybill
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setIsTrailOpen(true)}>
                <Activity className="mr-2 h-4 w-4" /> View Trail
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsShareReceiptOpen(true)}>
                <Share2 className="mr-2 h-4 w-4" /> Share Receipt
              </Button>
              <Badge variant={getStatusVariant(order.orderStatus)} className="text-base">{order.orderStatus}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Customer</p>
            {customer ? (
              <Link href={`/dashboard/customers/${customer.id}`} className="font-semibold text-primary hover:underline block">
                {customer.fullName}
              </Link>
            ) : (
              <p className="font-semibold">{order.spx_sync_data ? 'Shopee Customer' : 'Walk-in / Unknown'}</p>
            )}
            <p className="text-sm text-muted-foreground">{customer?.email}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Payment Type</p>
            <p className="font-semibold">{order.paymentType}</p>
            {order.paymentType === 'Installment' && (
              <div className="text-sm text-muted-foreground mt-1">
                <p>{order.installmentMonths} months</p>
                {order.monthlyPayment != null && <p>₱{order.monthlyPayment.toFixed(2)} / month</p>}
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
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Line Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rawItems.length > 0 ? rawItems.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell className="text-center">{item.quantity}</TableCell>
                  <TableCell className="text-right">₱{(item.sellingPriceAtSale || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right text-destructive">- ₱{(item.discount || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-medium">₱{(((item.sellingPriceAtSale || 0) - (item.discount || 0)) * (item.quantity || 1)).toFixed(2)}</TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={5} className="h-24 text-center">No items found for this order.</TableCell></TableRow>
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
                    <TableCell className="text-right font-medium">₱{(p.amount || 0).toFixed(2)}</TableCell>
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
              <span>₱{(order.subtotal ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="text-destructive">- ₱{(order.totalDiscount ?? 0).toFixed(2)}</span>
            </div>
            {!!order.insurance_fee && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Insurance Fee (1%)</span>
                <span>+ ₱{order.insurance_fee.toFixed(2)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-bold text-base">
              <span>Total</span>
              <span>₱{(order.totalAmount || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount Paid</span>
              <span>₱{(order.amountPaid || 0).toFixed(2)}</span>
            </div>
            {(shippingFee > 0 || processingFee > 0) && (() => {
              const totalDeductions = shippingFee + processingFee;
              const netRemittance = (order.amountPaid || 0) - totalDeductions;
              const difference = netRemittance - (order.totalAmount || 0);
              return (
                <div className="bg-muted/30 p-2 rounded-md mt-1 mb-2">
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>COD Collected</span><span>₱{(order.amountPaid || 0).toFixed(2)}</span>
                  </div>
                  {shippingFee > 0 && (
                    <div className="flex justify-between text-destructive text-xs">
                      <span>Shipping Fee</span><span>- ₱{shippingFee.toFixed(2)}</span>
                    </div>
                  )}
                  {processingFee > 0 && (
                    <div className="flex justify-between text-destructive text-xs">
                      <span>Courier / Processing Fee</span><span>- ₱{processingFee.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-primary text-xs font-semibold mt-1 pt-1 border-t">
                    <span>Net Remittance</span><span>₱{netRemittance.toFixed(2)}</span>
                  </div>
                  {difference !== 0 && (
                    <div className={`flex justify-between text-xs font-semibold mt-1 pt-1 border-t ${difference > 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                      <span>{difference > 0 ? 'Additional Shipping Profit' : 'Shipping Loss / Extra Fee'}</span>
                      <span>{difference > 0 ? '+' : '-'} ₱{Math.abs(difference).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="flex justify-between font-semibold text-base">
              <span>Balance Due</span>
              <span>₱{(order.balanceDue || 0).toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {order && <ShareReceiptDialog open={isShareReceiptOpen} onOpenChange={setIsShareReceiptOpen} order={order} customer={customer ? { fullName: customer.fullName, address: customer.address } : null} orderItems={rawItems} />}
      {order && <MarkShippedDialog open={isMarkShippedOpen} onOpenChange={setIsMarkShippedOpen} orderId={order.id} currentTrackingNumber={order.tracking_number || ''} onSuccess={() => setIsMarkShippedOpen(false)} />}
      {order && <EditOrderDialog open={isEditOpen} onOpenChange={setIsEditOpen} order={order} orderItems={rawItems} />}
      {order && <WaybillSummaryDialog open={isWaybillOpen} onOpenChange={setIsWaybillOpen} order={order} />}
      {order && <OrderTrailDialog open={isTrailOpen} onOpenChange={setIsTrailOpen} orderId={order.id} />}
    </div>
  );
}
