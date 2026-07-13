'use client';

import { useMemo, useEffect, useState } from 'react';
import { Skeleton } from '../ui/skeleton';
import { useUserProfile } from '@/hooks/useUserProfile';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/supabase/hooks';
import { DateRange } from 'react-day-picker';
import { Package } from 'lucide-react';

type TopProductItem = {
    name: string;
    sku: string;
    quantity: number;
};

type TopProductsProps = {
    dateRange?: DateRange;
    salespersonId?: string;
};

export function TopProducts({ dateRange, salespersonId = 'all' }: TopProductsProps) {
    const { user } = useUser();
    const { userProfile } = useUserProfile();
    const [topProducts, setTopProducts] = useState<TopProductItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const canSeeProducts = useMemo(() => {
        if (!userProfile) return false;
        return userProfile.roles.some(r => ['Owner', 'Admin', 'Sales', 'Inventory'].includes(r));
    }, [userProfile]);

    useEffect(() => {
        if (!user) return;

        let isMounted = true;
        const supabase = createClient();

        const fetchTopProducts = async () => {
            setIsLoading(true);
            try {
                let builder = supabase
                    .from('orders')
                    .select('id, status');

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
                        setTopProducts([]);
                        setIsLoading(false);
                    }
                    return;
                }

                const validOrderIds = orders
                    .filter(o => o.status !== 'Cancelled' && o.status !== 'Returned')
                    .map(o => o.id);

                if (validOrderIds.length === 0) {
                    if (isMounted) setTopProducts([]);
                    return;
                }

                const productTotals = new Map<string, number>();

                // Chunk order IDs to avoid limits
                const chunkSize = 200;
                for (let i = 0; i < validOrderIds.length; i += chunkSize) {
                    const chunk = validOrderIds.slice(i, i + chunkSize);
                    const { data: orderItems } = await supabase
                        .from('order_items')
                        .select('product_id, quantity')
                        .in('order_id', chunk);

                    if (orderItems) {
                        orderItems.forEach(item => {
                            if (item.product_id) {
                                productTotals.set(item.product_id, (productTotals.get(item.product_id) || 0) + Number(item.quantity || 0));
                            }
                        });
                    }
                }

                // Sort and get top 5
                const top5ProductEntries = Array.from(productTotals.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);

                if (top5ProductEntries.length === 0) {
                    if (isMounted) setTopProducts([]);
                    return;
                }

                const topProductIds = top5ProductEntries.map(e => e[0]);
                const productMap = new Map<string, { name: string; sku: string }>();

                if (canSeeProducts) {
                    const { data: products, error: productsError } = await supabase
                        .from('products')
                        .select('id, name, sku')
                        .in('id', topProductIds);

                    if (!productsError && products) {
                        products.forEach(p => {
                            productMap.set(p.id, {
                                name: p.name || 'Unknown Product',
                                sku: p.sku || 'No SKU',
                            });
                        });
                    }
                }

                const productsList: TopProductItem[] = top5ProductEntries.map(([productId, quantity]) => {
                    let name = 'Unknown Product';
                    let sku = '';

                    if (canSeeProducts) {
                        const product = productMap.get(productId);
                        if (product) {
                            name = product.name;
                            sku = product.sku;
                        }
                    } else {
                        name = 'Restricted (No Access)';
                        sku = '';
                    }

                    return {
                        name,
                        sku,
                        quantity,
                    };
                });

                if (isMounted) {
                    setTopProducts(productsList);
                }
            } catch (err) {
                console.warn('Error fetching top products:', err);
                if (isMounted) setTopProducts([]);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchTopProducts();
        return () => { isMounted = false; };
    }, [user, canSeeProducts, dateRange, salespersonId]);

    if (isLoading) {
        return (
            <div className="space-y-8">
                {Array.from({length: 5}).map((_, i) => (
                    <div className="flex items-center" key={i}>
                        <div className="flex items-center justify-center h-9 w-9 rounded-md border bg-muted">
                            <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="ml-4 space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-4 w-16" />
                        </div>
                        <Skeleton className="ml-auto h-4 w-8" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {topProducts.map((product, index) => (
                <div className="flex items-center" key={index}>
                    <div className="flex items-center justify-center h-9 w-9 rounded-md border bg-muted">
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="ml-4 space-y-1">
                        <p className="text-sm font-medium leading-none">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.sku}</p>
                    </div>
                    <div className="ml-auto font-medium text-sm">
                        {product.quantity} sold
                    </div>
                </div>
            ))}
            {!isLoading && topProducts.length === 0 && (
                <p className='text-sm text-muted-foreground text-center py-10'>No data to display.</p>
            )}
        </div>
    );
}
