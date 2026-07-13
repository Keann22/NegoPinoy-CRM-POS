'use client';

import Link from 'next/link';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useMemo, useEffect, useState } from 'react';
import { Skeleton } from '../ui/skeleton';
import { useUserProfile } from '@/hooks/useUserProfile';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/supabase/hooks';

import { DateRange } from 'react-day-picker';

type RecentSaleItem = {
    orderId: string;
    customerId: string | null;
    name: string;
    email: string;
    amount: string;
    avatarFallback: string;
};

type RecentSalesProps = {
    dateRange?: DateRange;
    salespersonId?: string;
};

export function RecentSales({ dateRange, salespersonId = 'all' }: RecentSalesProps) {
    const { user } = useUser();
    const { userProfile } = useUserProfile();
    const [recentSales, setRecentSales] = useState<RecentSaleItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const canSeeCustomers = useMemo(() => {
        if (!userProfile) return false;
        return userProfile.roles.some(r => ['Owner', 'Admin', 'Sales'].includes(r));
    }, [userProfile]);

    useEffect(() => {
        if (!user) return;

        let isMounted = true;
        const supabase = createClient();

        const fetchRecentSales = async () => {
            setIsLoading(true);
            try {
                let builder = supabase
                    .from('orders')
                    .select('id, customer_id, total_amount')
                    .order('created_at', { ascending: false })
                    .limit(5);

                if (salespersonId !== 'all') {
                    builder = builder.eq('sales_person_id', salespersonId);
                }
                
                if (dateRange?.from) {
                    builder = builder.gte('created_at', dateRange.from.toISOString());
                }
                if (dateRange?.to) {
                    const toDate = new Date(dateRange.to);
                    toDate.setHours(23, 59, 59, 999);
                    builder = builder.lte('created_at', toDate.toISOString());
                }

                const { data: orders, error: ordersError } = await builder;

                if (ordersError) throw ordersError;
                if (!orders || orders.length === 0) {
                    if (isMounted) {
                        setRecentSales([]);
                        setIsLoading(false);
                    }
                    return;
                }

                // Build customer map if user can see customers
                const customerMap = new Map<string, { name: string; email: string }>();

                if (canSeeCustomers) {
                    const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];
                    if (customerIds.length > 0) {
                        const { data: customers, error: customersError } = await supabase
                            .from('customers')
                            .select('id, full_name, email')
                            .in('id', customerIds);

                        if (!customersError && customers) {
                            customers.forEach(c => {
                                customerMap.set(c.id, {
                                    name: c.full_name || 'Unknown Customer',
                                    email: c.email || '',
                                });
                            });
                        }
                    }
                }

                const sales: RecentSaleItem[] = orders.map(order => {
                    let name = 'Unknown Customer';
                    let email = '';

                    if (canSeeCustomers) {
                        const customer = customerMap.get(order.customer_id);
                        if (customer) {
                            name = customer.name;
                            email = customer.email;
                        }
                        // If customer not found in map but we have access, it may be a deleted/missing customer
                    } else {
                        name = 'Restricted (No Access)';
                        email = 'Access restricted by role';
                    }

                    const fallback = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                    return {
                        orderId: order.id,
                        customerId: canSeeCustomers ? order.customer_id : null,
                        name,
                        email,
                        amount: `+₱${Number(order.total_amount || 0).toFixed(2)}`,
                        avatarFallback: fallback || 'UC',
                    };
                });

                if (isMounted) {
                    setRecentSales(sales);
                }
            } catch (err) {
                console.warn('Error fetching recent sales:', err);
                if (isMounted) setRecentSales([]);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchRecentSales();
        return () => { isMounted = false; };
    }, [user, canSeeCustomers, dateRange, salespersonId]);

    if (isLoading) {
        return (
            <div className="space-y-8">
                {Array.from({length: 5}).map((_, i) => (
                    <div className="flex items-center" key={i}>
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="ml-4 space-y-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-32" />
                        </div>
                        <Skeleton className="ml-auto h-4 w-16" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {recentSales.map((sale, index) => (
                <div className="flex items-center" key={index}>
                <Avatar className="h-9 w-9">
                    <AvatarFallback>{sale.avatarFallback}</AvatarFallback>
                </Avatar>
                <div className="ml-4 space-y-1">
                    {sale.customerId ? (
                        <Link href={`/dashboard/customers/${sale.customerId}`} className="text-sm font-medium leading-none text-primary hover:underline">
                            {sale.name}
                        </Link>
                    ) : (
                        <p className="text-sm font-medium leading-none">{sale.name}</p>
                    )}
                    <p className="text-sm text-muted-foreground">{sale.email}</p>
                </div>
                <div className="ml-auto font-medium">
                    <Link href={`/dashboard/orders/${sale.orderId}`} className="hover:underline">
                        {sale.amount}
                    </Link>
                </div>
                </div>
            ))}
            {!isLoading && recentSales.length === 0 && (
                <p className='text-sm text-muted-foreground text-center py-10'>No recent sales to display.</p>
            )}
        </div>
    );
}
