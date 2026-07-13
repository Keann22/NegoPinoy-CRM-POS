'use client';

import Link from 'next/link';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useMemo, useEffect, useState } from 'react';
import { Skeleton } from '../ui/skeleton';
import { useUserProfile } from '@/hooks/useUserProfile';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/supabase/hooks';
import { DateRange } from 'react-day-picker';

type TopCustomerItem = {
    id: string | null;
    name: string;
    email: string;
    amount: string;
    avatarFallback: string;
};

type TopCustomersProps = {
    dateRange?: DateRange;
    salespersonId?: string;
};

export function TopCustomers({ dateRange, salespersonId = 'all' }: TopCustomersProps) {
    const { user } = useUser();
    const { userProfile } = useUserProfile();
    const [topCustomers, setTopCustomers] = useState<TopCustomerItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const canSeeCustomers = useMemo(() => {
        if (!userProfile) return false;
        return userProfile.roles.some(r => ['Owner', 'Admin', 'Sales'].includes(r));
    }, [userProfile]);

    useEffect(() => {
        if (!user) return;

        let isMounted = true;
        const supabase = createClient();

        const fetchTopCustomers = async () => {
            setIsLoading(true);
            try {
                let builder = supabase
                    .from('orders')
                    .select('customer_id, total_amount, status');

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
                        setTopCustomers([]);
                        setIsLoading(false);
                    }
                    return;
                }

                // Aggregate totals by customer
                const customerTotals = new Map<string, number>();
                orders.forEach(o => {
                    if (o.status !== 'Cancelled' && o.status !== 'Returned' && o.customer_id) {
                        customerTotals.set(o.customer_id, (customerTotals.get(o.customer_id) || 0) + Number(o.total_amount || 0));
                    }
                });

                // Sort and get top 5
                const top5CustomerEntries = Array.from(customerTotals.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);

                if (top5CustomerEntries.length === 0) {
                    if (isMounted) setTopCustomers([]);
                    return;
                }

                const topCustomerIds = top5CustomerEntries.map(e => e[0]);
                const customerMap = new Map<string, { name: string; email: string }>();

                if (canSeeCustomers) {
                    const { data: customers, error: customersError } = await supabase
                        .from('customers')
                        .select('id, full_name, email')
                        .in('id', topCustomerIds);

                    if (!customersError && customers) {
                        customers.forEach(c => {
                            customerMap.set(c.id, {
                                name: c.full_name || 'Unknown Customer',
                                email: c.email || '',
                            });
                        });
                    }
                }

                const customersList: TopCustomerItem[] = top5CustomerEntries.map(([customerId, totalAmount]) => {
                    let name = 'Unknown Customer';
                    let email = '';

                    if (canSeeCustomers) {
                        const customer = customerMap.get(customerId);
                        if (customer) {
                            name = customer.name;
                            email = customer.email;
                        }
                    } else {
                        name = 'Restricted (No Access)';
                        email = 'Access restricted by role';
                    }

                    const fallback = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                    return {
                        id: canSeeCustomers ? customerId : null,
                        name,
                        email,
                        amount: `₱${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        avatarFallback: fallback || 'UC',
                    };
                });

                if (isMounted) {
                    setTopCustomers(customersList);
                }
            } catch (err) {
                console.warn('Error fetching top customers:', err);
                if (isMounted) setTopCustomers([]);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchTopCustomers();
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
            {topCustomers.map((customer, index) => (
                <div className="flex items-center" key={index}>
                <Avatar className="h-9 w-9">
                    <AvatarFallback>{customer.avatarFallback}</AvatarFallback>
                </Avatar>
                <div className="ml-4 space-y-1">
                    {customer.id ? (
                        <Link href={`/dashboard/customers/${customer.id}`} className="text-sm font-medium leading-none text-primary hover:underline">
                            {customer.name}
                        </Link>
                    ) : (
                        <p className="text-sm font-medium leading-none">{customer.name}</p>
                    )}
                    <p className="text-sm text-muted-foreground">{customer.email}</p>
                </div>
                <div className="ml-auto font-medium">{customer.amount}</div>
                </div>
            ))}
            {!isLoading && topCustomers.length === 0 && (
                <p className='text-sm text-muted-foreground text-center py-10'>No data to display.</p>
            )}
        </div>
    );
}
