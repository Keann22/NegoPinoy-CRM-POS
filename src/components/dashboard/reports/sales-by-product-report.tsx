'use client';

import { useEffect, useState } from 'react';
import { useUser, useSupabase } from '@/lib/supabase/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

type ProductStat = {
    name: string;
    qty: number;
    revenue: number;
};

export function SalesByProductReport() {
    const supabase = useSupabase();
    const { user } = useUser();

    const [aggregated, setAggregated] = useState<ProductStat[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!supabase || !user) return;
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('order_items')
                    .select('product_id, product_name, quantity, selling_price_at_sale, products(name)');

                if (error) throw error;

                const map = new Map<string, ProductStat>();
                (data || []).forEach((item: any) => {
                    const productId = item.product_id || item.product_name;
                    const name = item.products?.name || item.product_name || 'Unknown Product';
                    const qty = Number(item.quantity) || 0;
                    const revenue = qty * (Number(item.selling_price_at_sale) || 0);

                    const existing = map.get(productId) || { name, qty: 0, revenue: 0 };
                    map.set(productId, {
                        name,
                        qty: existing.qty + qty,
                        revenue: existing.revenue + revenue,
                    });
                });

                setAggregated(Array.from(map.values()).sort((a, b) => b.qty - a.qty));
            } catch (err) {
                console.error('Sales by product error:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [supabase, user]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Sales by Product</CardTitle>
                <CardDescription>Which products are moving the fastest.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Qty Sold</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                            </TableRow>
                        )) : aggregated.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No sales data found.</TableCell>
                            </TableRow>
                        ) : aggregated.map((p, i) => (
                            <TableRow key={i}>
                                <TableCell className="font-medium">{p.name}</TableCell>
                                <TableCell className="text-right">{p.qty}</TableCell>
                                <TableCell className="text-right">₱{p.revenue.toFixed(2)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}