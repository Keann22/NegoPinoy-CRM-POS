'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LogPaymentDialog } from '@/components/dashboard/log-payment-dialog';
import { format } from 'date-fns';
import { type Order } from '@/app/dashboard/orders/page';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { AddCustomerDialog } from '@/components/dashboard/add-customer-dialog';
import { Pencil, Mail, MessageSquare } from 'lucide-react';
import { StoreCreditLedgerTable } from '@/components/dashboard/customers/StoreCreditLedgerTable';
import { LiveChatMatchCard } from '@/components/dashboard/customers/LiveChatMatchCard';
import { useCustomerDetail, type CustomerProfileData } from '@/hooks/useCustomerDetail';

const getStatusVariant = (status: Order['orderStatus']) => {
  if (['Shipped', 'Completed', 'Waiting for Stock'].includes(status)) return 'outline';
  if (['Processing', 'On-Hold'].includes(status)) return 'secondary';
  if (['Cancelled', 'Returned'].includes(status)) return 'destructive';
  return 'default';
};

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = params.id as string;
  const router = useRouter();

  const [logPaymentOrder, setLogPaymentOrder] = useState<Order | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<CustomerProfileData | null>(null);

  const {
    customer,
    orders,
    payments,
    ledgerEntries,
    isLoading,
    totalBalanceOwed,
    outstandingOrders,
    refresh,
  } = useCustomerDetail(customerId);

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

  const addressSummary =
    [customer.streetAddress, customer.barangay, customer.city, customer.province]
      .filter(Boolean)
      .join(', ') ||
    customer.addressLine ||
    '';

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-2xl">
                {(customer.fullName?.[0] || 'U').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle className="text-3xl font-headline">
                {customer.fullName || 'Unnamed Customer'}
              </CardTitle>
              <div className="flex flex-col gap-1 mt-2 mb-4 text-sm text-muted-foreground">
                {customer.email && (
                  <div className="flex items-center gap-2">
                    <span>✉️</span> {customer.email}
                  </div>
                )}
                {customer.mobileNumber && (
                  <div className="flex items-center gap-2">
                    <span>📱</span> {customer.mobileNumber}
                  </div>
                )}

                {/* Address Display */}
                {customer.region || customer.province ? (
                  <div className="flex items-start gap-2">
                    <span>📍</span>
                    <div>
                      <div>
                        {customer.streetAddress && `${customer.streetAddress}, `}
                        {customer.barangay}
                      </div>
                      <div>
                        {customer.city}, {customer.province}
                      </div>
                      <div className="text-xs opacity-75">
                        {customer.region} {customer.postalCode}
                      </div>
                    </div>
                  </div>
                ) : customer.addressLine ? (
                  <div className="flex items-center gap-2">
                    <span>📍</span> {customer.addressLine}
                  </div>
                ) : null}

                {customer.facebookProfileLink && (
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-[#1877F2]"
                      aria-hidden="true"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="currentColor"
                      viewBox="0 0 8 19"
                    >
                      <path
                        fillRule="evenodd"
                        d="M6.135 3H8V0H6.135a4.147 4.147 0 0 0-4.142 4.142V6H0v3h2v9.938h3V9h2.021l.592-3H5V3.591A.6.6 0 0 1 5.592 3h.543Z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <a
                      href={customer.facebookProfileLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Facebook Profile
                    </a>
                  </div>
                )}
              </div>
              <CardDescription className="text-base mt-2">
                Total Outstanding Balance:{' '}
                <span className="font-bold text-destructive">
                  ₱{Number(totalBalanceOwed || 0).toFixed(2)}
                </span>
              </CardDescription>
              {customer.storeCredit && Number(customer.storeCredit) > 0 ? (
                <CardDescription className="text-base mt-1 text-green-600 font-semibold">
                  Store credit: ₱{Number(customer.storeCredit || 0).toFixed(2)}
                </CardDescription>
              ) : null}
            </div>
            <div className="self-start flex flex-wrap items-center gap-2">
              {customer.psid && (
                <Button size="sm" asChild className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Link href={`/dashboard/chat?psid=${encodeURIComponent(customer.psid)}`}>
                    <MessageSquare className="h-4 w-4 mr-2" /> Message on Live Chat
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/dashboard/customers/email?customerId=${customer.id}&email=${encodeURIComponent(
                    customer.email || ''
                  )}&name=${encodeURIComponent(customer.fullName || '')}`}
                >
                  <Mail className="h-4 w-4 mr-2 text-primary" /> Email Suki
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditingCustomer(customer)}>
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Live Chat Match Prompt OR Connected Messenger Preview */}
        <LiveChatMatchCard
          customerId={customer.id}
          fullName={customer.fullName}
          mobileNumber={customer.mobileNumber}
          addressSummary={addressSummary}
          psid={customer.psid}
          mode="full"
          onLinked={() => refresh()}
        />

        {editingCustomer && (
          <AddCustomerDialog
            open={!!editingCustomer}
            onOpenChange={(open) => !open && setEditingCustomer(null)}
            customerToEdit={editingCustomer}
            onSuccess={() => {
              setEditingCustomer(null);
              refresh();
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
                {outstandingOrders.length > 0 ? (
                  outstandingOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        {order.orderDate ? format(new Date(order.orderDate), 'PPP') : 'N/A'}
                      </TableCell>
                      <TableCell>₱{Number(order.totalAmount || 0).toFixed(2)}</TableCell>
                      <TableCell className="font-semibold">
                        ₱{Number(order.balanceDue || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => setLogPaymentOrder(order)}>
                          Log Payment
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      No outstanding balances.
                    </TableCell>
                  </TableRow>
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
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length > 0 ? (
                  orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        {order.orderDate ? format(new Date(order.orderDate), 'PPP') : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(order.orderStatus)}>
                          {order.orderStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>{order.salesPersonName || 'Unassigned'}</TableCell>
                      <TableCell className="text-right">
                        ₱{Number(order.totalAmount || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/dashboard/orders/${order.id}`)}
                        >
                          View Order
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      No orders found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Store Credit Ledger Section */}
        <StoreCreditLedgerTable entries={ledgerEntries} />

        {/* Payment History Section */}
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>
              A complete log of all payments received from this customer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments && payments.length > 0 ? (
                  payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {payment.paymentDate
                          ? format(new Date(payment.paymentDate), 'PPP p')
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/orders/${payment.orderId}`}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          #{payment.orderId.slice(0, 7).toUpperCase()}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            payment.paymentMethod === 'Store Credit' ? 'secondary' : 'outline'
                          }
                        >
                          {payment.paymentMethod}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ₱{Number(payment.amount || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      No payments recorded.
                    </TableCell>
                  </TableRow>
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
            refresh();
          }}
        />
      )}
    </>
  );
}
