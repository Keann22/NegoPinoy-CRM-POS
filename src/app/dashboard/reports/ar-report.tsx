'use client';
import Link from 'next/link';
import { useMemo, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useUser, useSupabase } from '@/lib/supabase/hooks';

type ReceivableOrder = {
    id: string;
    totalAmount: number;
    balanceDue: number;
    orderDate: string;
    customerId: string;
    customerName: string;
    paymentType: string;
    orderStatus: string;
    installmentMonths?: number;
};

export function AccountsReceivableReport() {
    const supabase = useSupabase();
    const { user } = useUser();

    const [orders, setOrders] = useState<ReceivableOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!supabase || !user) return;
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch orders with balance due for installment/lay-away
                const { data: ordersData, error } = await supabase
                    .from('orders')
                    .select('id, total_amount, balance_due, order_date, created_at, customer_id, payment_method, status, installment_months')
                    .gt('balance_due', 0)
                    .in('payment_method', ['Installment', 'Lay-away'])
                    .not('status', 'in', '("Cancelled","Returned")')
                    .order('order_date', { ascending: false });

                if (error) throw error;

                const mapped = ordersData || [];
                if (mapped.length === 0) { setOrders([]); return; }

                const customerIds = Array.from(new Set(mapped.map((o: any) => o.customer_id)));
                const { data: customersData } = await supabase
                    .from('customers')
                    .select('id, full_name')
                    .in('id', customerIds);

                const customerMap = new Map<string, string>();
                (customersData || []).forEach((c: any) => customerMap.set(c.id, c.full_name || 'Unknown Customer'));

                setOrders(mapped.map((o: any) => ({
                    id: o.id,
                    totalAmount: Number(o.total_amount) || 0,
                    balanceDue: Number(o.balance_due) || 0,
                    orderDate: o.order_date || o.created_at,
                    customerId: o.customer_id,
                    customerName: customerMap.get(o.customer_id) || 'Unknown Customer',
                    paymentType: o.payment_method,
                    orderStatus: o.status,
                    installmentMonths: o.installment_months,
                })));
            } catch (err) {
                console.error('AR report error:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [supabase, user]);

    const totalOutstanding = useMemo(() => orders.reduce((sum, o) => sum + o.balanceDue, 0), [orders]);

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <CardTitle className="font-headline">Accounts Receivable</CardTitle>
                        <CardDescription>Report on outstanding installment and lay-away balances.</CardDescription>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-medium text-muted-foreground">Total Outstanding</p>
                        {isLoading ? (
                            <Skeleton className="h-8 w-32 mt-1" />
                        ) : (
                            <p className="text-2xl font-bold">₱{totalOutstanding.toFixed(2)}</p>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground mb-4">This report lists all customers with a remaining balance.</p>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Order Date</TableHead>
                            <TableHead>Terms</TableHead>
                            <TableHead className="text-right">Total Amount</TableHead>
                            <TableHead className="text-right">Balance Due</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                    {isLoading && Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                        </TableRow>
                    ))}
                    {orders.map((order) => (
                        <TableRow key={order.id}>
                            <TableCell className="font-medium">
                                {order.customerId ? (
                                    <Link href={`/dashboard/customers/${order.customerId}`} className="text-primary hover:underline">
                                        {order.customerName}
                                    </Link>
                                ) : order.customerName}
                                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                                    <Link href={`/dashboard/orders/${order.id}`} className="hover:underline">
                                        #{order.id.split('-')[0].toUpperCase()}
                                    </Link>
                                </div>
                            </TableCell>
                            <TableCell>{format(new Date(order.orderDate), 'PPP')}</TableCell>
                            <TableCell>
                                <span className="text-muted-foreground">
                                    {order.paymentType}
                                    {order.paymentType === 'Installment' && ` (${order.installmentMonths || 'N/A'} mos.)`}
                                </span>
                            </TableCell>
                            <TableCell className="text-right">₱{order.totalAmount.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold">₱{order.balanceDue.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
                {!isLoading && orders.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                    <p className="text-lg font-semibold">No Outstanding Balances</p>
                    <p className="text-muted-foreground mt-2">All installment and lay-away plans are fully paid.</p>
                </div>
                )}
            </CardContent>
        </Card>
    );
}
