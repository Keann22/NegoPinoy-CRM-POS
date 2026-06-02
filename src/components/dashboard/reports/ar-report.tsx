'use client';
import { useMemo } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '@/components/ui/table';
import { useCollection, useSupabase, useUser, collection, query, where } from '@/firebase';


type Order = {
    id: string;
    totalAmount: number;
    balanceDue: number;
    orderDate: string;
    customerId: string;
    paymentType: string;
};

type Customer = {
    id: string;
    firstName: string;
    lastName: string;
};

export function AccountsReceivableReport() {
    const supabase = useSupabase();
    const { user } = useUser();

    const arOrdersQuery = useMemo(() => {
        if (!supabase || !user) return null;
        return query(
            collection(supabase, 'orders'),
            where('paymentType', '==', 'Installment'),
            where('balanceDue', '>', 0)
        );
    }, [supabase, user]);
    const { data: arOrders, isLoading: isLoadingOrders } = useCollection<Order>(arOrdersQuery);
    
    const customersQuery = useMemo(() => {
        if (!supabase || !user) return null;
        return collection(supabase, 'customers');
    }, [supabase, user]);
    const { data: customers, isLoading: isLoadingCustomers } = useCollection<Customer>(customersQuery);

    const isLoading = isLoadingOrders || isLoadingCustomers;

    const customerMap = useMemo(() => {
        if (!customers) return new Map();
        return new Map(customers.map(c => [c.id, `${c.firstName} ${c.lastName}`]));
    }, [customers]);

    const { totalOutstanding, customerBreakdown } = useMemo(() => {
        if (!arOrders) {
            return { totalOutstanding: 0, customerBreakdown: [] };
        }

        const total = arOrders.reduce((sum, order) => sum + order.balanceDue, 0);
        const breakdown = arOrders.map(order => ({
            ...order,
            customerName: customerMap.get(order.customerId) || 'Unknown Customer'
        }));

        return { totalOutstanding: total, customerBreakdown: breakdown };
    }, [arOrders, customerMap]);

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <CardTitle className="font-headline">Accounts Receivable</CardTitle>
                        <CardDescription>Report on outstanding installment balances.</CardDescription>
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
                <h3 className="text-lg font-semibold mb-2">Overdue / Outstanding Balances</h3>
                <p className="text-sm text-muted-foreground mb-4">
                    List of all customers with a remaining balance on an installment plan. Currently, payment due dates are not tracked.
                </p>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Order Date</TableHead>
                            <TableHead className="text-right">Total Amount</TableHead>
                            <TableHead className="text-right">Balance Due</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                    {isLoading && Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                        </TableRow>
                    ))}
                    {customerBreakdown.map((order) => (
                        <TableRow key={order.id}>
                            <TableCell className="font-medium">{order.customerName}</TableCell>
                            <TableCell>{format(new Date(order.orderDate), 'PPP')}</TableCell>
                            <TableCell className="text-right">₱{order.totalAmount.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold">₱{order.balanceDue.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
                {!isLoading && customerBreakdown.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                    <p className="text-lg font-semibold">No Outstanding Balances</p>
                    <p className="text-muted-foreground mt-2">
                    All installment plans are fully paid.
                    </p>
                </div>
                )}
            </CardContent>
        </Card>
    );
}
