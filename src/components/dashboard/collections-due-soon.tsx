'use client';

import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useEffect, useState } from 'react';
import { format, isBefore, addDays, startOfDay } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';

export function CollectionsDueSoon() {
    const supabase = useSupabase();
    const { user } = useUser();
    const { userProfile } = useUserProfile();
    const router = useRouter();
    
    const [dueOrders, setDueOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!supabase || !user) return;

        const fetchDueOrders = async () => {
            setIsLoading(true);
            try {
                // We want orders where balance_due > 0 and next_due_date is within the next 5 days
                const today = startOfDay(new Date());
                const fiveDaysFromNow = addDays(today, 6); // Add 6 to ensure we get up to end of 5th day

                let query = supabase
                    .from('orders')
                    .select('id, customer_id, balance_due, next_due_date, payment_method, status, sales_person_name')
                    .gt('balance_due', 0)
                    .not('next_due_date', 'is', null)
                    .lte('next_due_date', fiveDaysFromNow.toISOString())
                    .order('next_due_date', { ascending: true })
                    .limit(10);
                
                // Only show relevant to salesperson, unless Admin/Owner
                if (userProfile && !userProfile.roles.some(r => ['Admin', 'Owner'].includes(r))) {
                    query = query.eq('sales_person_id', userProfile.id);
                }

                const { data: ordersData, error } = await query;
                if (error) throw error;

                if (ordersData && ordersData.length > 0) {
                    const customerIds = Array.from(new Set(ordersData.map(o => o.customer_id)));
                    const { data: customersData } = await supabase
                        .from('customers')
                        .select('id, full_name')
                        .in('id', customerIds);
                    
                    const customerMap = new Map();
                    if (customersData) {
                        customersData.forEach(c => customerMap.set(c.id, c.full_name));
                    }

                    const enriched = ordersData.map(o => ({
                        ...o,
                        customerName: customerMap.get(o.customer_id) || 'Unknown Customer',
                    }));
                    setDueOrders(enriched);
                } else {
                    setDueOrders([]);
                }
            } catch (error) {
                console.error("Failed to fetch due orders", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDueOrders();
    }, [supabase, user, userProfile]);

    if (isLoading) {
        return (
            <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
        );
    }

    if (dueOrders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-6 text-center border-2 border-dashed rounded-lg">
                <p className="text-muted-foreground">No upcoming collections due within 5 days.</p>
            </div>
        );
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Balance Due</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {dueOrders.map(order => {
                    const dueDate = new Date(order.next_due_date);
                    const isOverdue = isBefore(dueDate, startOfDay(new Date()));
                    return (
                        <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/dashboard/orders/${order.id}`)}>
                            <TableCell className="font-medium">
                                {order.customerName}
                                <p className="text-xs text-muted-foreground">{order.payment_method}</p>
                            </TableCell>
                            <TableCell>
                                <span className={isOverdue ? "text-destructive font-semibold" : ""}>
                                    {format(dueDate, 'MMM d, yyyy')}
                                </span>
                                {isOverdue && <Badge variant="destructive" className="ml-2 text-[10px]">Overdue</Badge>}
                            </TableCell>
                            <TableCell className="text-sm">
                                {order.sales_person_name || 'Unassigned'}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-destructive">
                                ₱{order.balance_due.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
