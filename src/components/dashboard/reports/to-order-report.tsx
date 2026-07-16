'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ProcurementProductDetailsDialog } from '@/components/dashboard/procurement-product-details-dialog';
import { Button } from '@/components/ui/button';
import { Printer, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

type ExplainingOrder = { shortOrderId: string; status: string; createdAt: string };

type ReconciliationItem = {
    productId: string;
    productName: string;
    currentStock: number;
    explainingOrder: ExplainingOrder | null;
};

type ProductDetails = {
    id: string;
    name: string;
    sku: string;
    quantityOnHand: number;
    supplierPricing?: { supplierName: string, supplierCode?: string }[];
    category?: string;
    description?: string;
    images?: string[];
};

export function ToOrderReport() {
    const supabase = useSupabase();
    const { user } = useUser();
    const { toast } = useToast();

    const [items, setItems] = useState<ReconciliationItem[]>([]);
    const [productDetailsById, setProductDetailsById] = useState<Record<string, ProductDetails>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [resettingId, setResettingId] = useState<string | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<ProductDetails | null>(null);

    const fetchData = useCallback(async () => {
        if (!supabase || !user) return;
        setIsLoading(true);
        try {
            const res = await fetch('/api/inventory/procurement');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load reconciliation list');
            const reconciliationItems: ReconciliationItem[] = data.reconciliationItems || [];
            setItems(reconciliationItems);

            if (reconciliationItems.length > 0) {
                const { data: products, error } = await supabase
                    .from('products')
                    .select('id, name, sku, stock_level, supplier_pricing, category, description, images')
                    .in('id', reconciliationItems.map(i => i.productId));
                if (error) throw error;
                const byId: Record<string, ProductDetails> = {};
                (products || []).forEach((p: any) => {
                    byId[p.id] = {
                        id: p.id,
                        name: p.name,
                        sku: p.sku,
                        quantityOnHand: p.stock_level ?? 0,
                        supplierPricing: p.supplier_pricing,
                        category: p.category,
                        description: p.description,
                        images: p.images,
                    };
                });
                setProductDetailsById(byId);
            } else {
                setProductDetailsById({});
            }
        } catch (err) {
            console.error('to-order-report fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [supabase, user]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const orphaned = useMemo(() => items.filter(i => !i.explainingOrder), [items]);
    const explained = useMemo(() => items.filter(i => i.explainingOrder), [items]);

    const handleResetToZero = async (item: ReconciliationItem) => {
        setResettingId(item.productId);
        try {
            const res = await fetch('/api/inventory/procurement/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId: item.productId, targetQty: 0 }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to reset stock');
            toast({ title: 'Stock reset to 0', description: `${item.productName} had no connected order.` });
            fetchData();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Reset failed', description: err.message });
        } finally {
            setResettingId(null);
        }
    };

    return (
        <Card className="printable-area">
            <CardHeader className="flex flex-row items-start justify-between">
                <div>
                    <CardTitle>Negative Stock Reconciliation</CardTitle>
                    <CardDescription>
                        Oversold products with no order currently waiting on them — not a purchasing task, but a stock/cost
                        deficit that still needs periodic review. (Products that need buying right now are on the
                        &quot;To Order (Procurement)&quot; sheet instead.)
                    </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => window.print()} title="Print Reconciliation List">
                        <Printer className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-8">
                <div>
                    <h3 className="font-semibold text-sm mb-1">No connected order — likely a data error</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                        Nothing in the order history explains this deficit. Safe to reset to 0.
                    </p>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="py-2">Product Name</TableHead>
                                <TableHead className="text-center py-2">Current Stock</TableHead>
                                <TableHead className="text-center py-2 w-40">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? Array.from({ length: 3 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                    <TableCell className="text-center"><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                                    <TableCell className="text-center"><Skeleton className="h-4 w-20 mx-auto" /></TableCell>
                                </TableRow>
                            )) : orphaned.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                                        None found.
                                    </TableCell>
                                </TableRow>
                            ) : orphaned.map(item => (
                                <TableRow
                                    key={item.productId}
                                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                                    onClick={() => setSelectedProduct(productDetailsById[item.productId] || null)}
                                >
                                    <TableCell className="font-medium py-1.5 text-sm">{item.productName}</TableCell>
                                    <TableCell className="text-center py-1.5">
                                        <Badge variant="destructive" className="text-xs px-1.5 py-0">
                                            {item.currentStock}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-center py-1.5">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={resettingId === item.productId}
                                            onClick={(e) => { e.stopPropagation(); handleResetToZero(item); }}
                                        >
                                            <RotateCcw className="h-3 w-3 mr-1" />
                                            Reset to 0
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <div>
                    <h3 className="font-semibold text-sm mb-1">Explained by an already-fulfilled order — accounting debt</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                        A real order consumed this stock, but it already shipped/completed with no purchase ever recorded
                        for it. The deficit is legitimate — leave it negative until it&apos;s actually restocked, so the
                        true cost can still be backfilled onto that order.
                    </p>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="py-2">Product Name</TableHead>
                                <TableHead className="text-center py-2">Current Stock</TableHead>
                                <TableHead className="py-2">Order</TableHead>
                                <TableHead className="text-center w-32 py-2">Actual Qty Bought</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? Array.from({ length: 3 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                    <TableCell className="text-center"><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                    <TableCell className="text-center"><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                                </TableRow>
                            )) : explained.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                                        None found.
                                    </TableCell>
                                </TableRow>
                            ) : explained.map(item => (
                                <TableRow
                                    key={item.productId}
                                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                                    onClick={() => setSelectedProduct(productDetailsById[item.productId] || null)}
                                >
                                    <TableCell className="font-medium py-1.5 text-sm">{item.productName}</TableCell>
                                    <TableCell className="text-center py-1.5">
                                        <Badge variant="destructive" className="text-xs px-1.5 py-0">
                                            {item.currentStock}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="py-1.5 text-xs text-muted-foreground">
                                        #{item.explainingOrder!.shortOrderId} · {item.explainingOrder!.status}
                                        {' · '}
                                        {format(new Date(item.explainingOrder!.createdAt), 'MMM d, yyyy')}
                                    </TableCell>
                                    <TableCell className="text-center py-1.5">
                                        <div className="w-16 h-4 border-b border-black mx-auto"></div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {!isLoading && items.length === 0 && (
                    <div className="flex flex-col items-center justify-center text-center py-12 border-2 border-dashed rounded-lg">
                        <p className="text-lg font-semibold text-primary">Nothing to reconcile!</p>
                        <p className="text-sm text-muted-foreground mt-1">Every negative-stock product is on the active procurement sheet.</p>
                    </div>
                )}
            </CardContent>

            <ProcurementProductDetailsDialog
                open={!!selectedProduct}
                onOpenChange={(isOpen) => !isOpen && setSelectedProduct(null)}
                product={selectedProduct}
            />
        </Card>
    );
}
