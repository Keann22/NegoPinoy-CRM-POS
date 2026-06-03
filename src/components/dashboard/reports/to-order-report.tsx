'use client';

import { useState, useMemo } from 'react';
import { useCollection, useSupabase, useUser, collection } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ProcurementProductDetailsDialog } from '@/components/dashboard/procurement-product-details-dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

type Product = {
    id: string;
    name: string;
    sku: string;
    quantityOnHand: number;
    supplier_pricing?: { supplierName: string }[];
    category?: string;
    description?: string;
    images?: string[];
};

export function ToOrderReport() {
    const supabase = useSupabase();
    const { user } = useUser();

    const productsQuery = useMemo(() => (supabase && user ? collection(supabase, 'products') : null), [supabase, user]);
    const { data: products, isLoading } = useCollection<Product>(productsQuery);

    const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

    const toOrder = useMemo(() => {
        if (!products) return [];
        // Only show products with strictly negative stock
        return products.filter(p => p.quantityOnHand < 0).sort((a, b) => a.quantityOnHand - b.quantityOnHand);
    }, [products]);

    const uniqueSuppliers = useMemo(() => {
        const suppliers = new Set<string>();
        toOrder.forEach(p => {
            if (p.supplier_pricing && Array.isArray(p.supplier_pricing)) {
                p.supplier_pricing.forEach(sp => suppliers.add(sp.supplierName));
            }
        });
        return Array.from(suppliers).sort();
    }, [toOrder]);

    const filteredToOrder = useMemo(() => {
        if (selectedSupplier === 'all') return toOrder;
        return toOrder.filter(p => 
            p.supplier_pricing && 
            Array.isArray(p.supplier_pricing) && 
            p.supplier_pricing.some(sp => sp.supplierName === selectedSupplier)
        );
    }, [toOrder, selectedSupplier]);

    return (
        <Card className="printable-area">
            <CardHeader className="flex flex-row items-start justify-between">
                <div>
                    <CardTitle>To Order (Procurement List)</CardTitle>
                    <CardDescription>Oversold products that need immediate restocking to fulfill current demand.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => window.print()} title="Print Procurement List">
                        <Printer className="h-4 w-4" />
                    </Button>
                    <div className="w-[200px]">
                    <select 
                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={selectedSupplier}
                        onChange={(e) => setSelectedSupplier(e.target.value)}
                        disabled={uniqueSuppliers.length === 0}
                    >
                        <option value="all">
                            {uniqueSuppliers.length === 0 ? "No Suppliers Assigned" : "All Suppliers"}
                        </option>
                        {uniqueSuppliers.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>SKU</TableHead>
                            <TableHead>Product Name</TableHead>
                            <TableHead className="text-center">Needed Qty</TableHead>
                            <TableHead className="text-center">Actual Qty Bought</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                <TableCell className="text-center"><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                                <TableCell className="text-center"><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                            </TableRow>
                        )) : filteredToOrder.map((p, i) => (
                            <TableRow 
                                key={i} 
                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => setSelectedProduct(p)}
                            >
                                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                                <TableCell className="font-medium">{p.name}</TableCell>
                                <TableCell className="text-center">
                                    <Badge variant="destructive" className="text-sm px-2">
                                        {Math.abs(p.quantityOnHand)}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                    <div className="w-16 h-6 border-b border-black mx-auto"></div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {!isLoading && filteredToOrder.length === 0 && (
                    <div className="flex flex-col items-center justify-center text-center py-12 border-2 border-dashed rounded-lg mt-4">
                        <p className="text-lg font-semibold text-primary">All stocked up!</p>
                        <p className="text-sm text-muted-foreground mt-1">No products have run out of stock.</p>
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
