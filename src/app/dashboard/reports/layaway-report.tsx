'use client';
import { useMemo, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { useUser, useSupabase } from '@/lib/supabase/hooks';

type LayawayOrder = {
    id: string;
    amountPaid: number;
    balanceDue: number;
    orderDate: string;
    customerId: string;
    paymentType: string;
    orderStatus: string;
    customerName: string;
};

export function LayawayReport() {
    const supabase = useSupabase();
    const { user } = useUser();

    const [orders, setOrders] = useState<LayawayOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!supabase || !user) return;
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch lay-away orders with balance due
                const { data: ordersData, error } = await supabase
                    .from('orders')
                    .select('id, amount_paid, balance_due, order_date, created_at, customer_id, payment_method, status')
                    .eq('payment_method', 'Lay-away')
                    .in('status', ['Pending Payment', 'Processing']);

                if (error) throw error;

                const mapped = ordersData || [];
                if (mapped.length === 0) {
                    setOrders([]);
                    return;
                }

                // Fetch customer names for these orders
                const customerIds = Array.from(new Set(mapped.map((o: any) => o.customer_id)));
                const { data: customersData } = await supabase
                    .from('customers')
                    .select('id, full_name')
                    .in('id', customerIds);

                const customerMap = new Map<string, string>();
                (customersData || []).forEach((c: any) => {
                    customerMap.set(c.id, c.full_name || 'Unknown Customer');
                });

                setOrders(mapped.map((o: any) => ({
                    id: o.id,
                    amountPaid: Number(o.amount_paid) || 0,
                    balanceDue: Number(o.balance_due) || 0,
                    orderDate: o.order_date || o.created_at,
                    customerId: o.customer_id,
                    paymentType: o.payment_method,
                    orderStatus: o.status,
                    customerName: customerMap.get(o.customer_id) || 'Unknown Customer',
                })));
            } catch (err) {
                console.error('Layaway report error:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [supabase, user]);

    const { totalPaid, totalPending } = useMemo(() => ({
        totalPaid: orders.reduce((sum, o) => sum + o.amountPaid, 0),
        totalPending: orders.reduce((sum, o) => sum + o.balanceDue, 0),
    }), [orders]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Lay-away (Hulugan) Balances</CardTitle>
                <CardDescription>Report on active lay-away plans where items have not yet been released.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid gap-4 md:grid-cols-2 mb-6">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Active Lay-aways (Total Paid)</CardDescription>
                            <CardTitle className="text-3xl">
                                {isLoading ? <Skeleton className="h-8 w-32" /> : `₱${totalPaid.toFixed(2)}`}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-muted-foreground">This is cash received for items not yet completed.</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Pending Completion (Balance Due)</CardDescription>
                            <CardTitle className="text-3xl">
                                {isLoading ? <Skeleton className="h-8 w-32" /> : `₱${totalPending.toFixed(2)}`}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-muted-foreground">This is the remaining amount to be collected for these lay-away plans.</p>
                        </CardContent>
                    </Card>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Order Date</TableHead>
                            <TableHead className="text-right">Amount Paid</TableHead>
                            <TableHead className="text-right">Balance Due</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                    {isLoading && Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                        </TableRow>
                    ))}
                    {orders.map((order) => (
                        <TableRow key={order.id}>
                            <TableCell className="font-medium">{order.customerName}</TableCell>
                            <TableCell>{format(new Date(order.orderDate), 'PPP')}</TableCell>
                            <TableCell className="text-right">₱{order.amountPaid.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold">₱{order.balanceDue.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
                {!isLoading && orders.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                    <p className="text-lg font-semibold">No Active Lay-away Plans</p>
                    <p className="text-muted-foreground mt-2">There are no current orders marked as 'Lay-away' with a pending balance.</p>
                </div>
                )}
            </CardContent>
        </Card>
    );
}
