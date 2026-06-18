'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Button } from '@/components/ui/button';

type FlattenedBatch = {
  batchId: string;
  productName: string;
  productSku: string;
  purchaseDate: string;
  originalQty: number;
  remainingQty: number;
  unitCost: number;
  supplierName: string;
};

export default function BatchesPage() {
  const supabase = useSupabase();
  const [allBatches, setAllBatches] = useState<FlattenedBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { userProfile } = useUserProfile();

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const totalPages = Math.ceil(allBatches.length / itemsPerPage);
  
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return allBatches.slice(startIndex, startIndex + itemsPerPage);
  }, [allBatches, currentPage]);

  const canSeeUnitCost = useMemo(() => {
      if (!userProfile) return false;
      return userProfile.roles.some(r => ['Owner', 'Admin'].includes(r));
  }, [userProfile]);

  useEffect(() => {
    if (!supabase) return;

    const loadBatches = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch all products
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('id, name, sku');
        if (productsError) throw productsError;

        // 2. Fetch all movements, ordered by time ASC (FIFO basis)
        const { data: movementsData, error: movementsError } = await supabase
          .from('inventory_movements')
          .select('id, product_id, quantity_change, unit_cost, supplier_name, timestamp')
          .order('timestamp', { ascending: true });
        if (movementsError) throw movementsError;

        // 3. FIFO calculation per product
        const calculatedBatches: FlattenedBatch[] = [];

        for (const product of productsData) {
           const productMovements = movementsData.filter(m => m.product_id === product.id);
           const productBatches: FlattenedBatch[] = [];

           for (const movement of productMovements) {
              const qtyChange = movement.quantity_change;
              
              if (qtyChange > 0) {
                 // It's a restock/receive, add as new batch
                 productBatches.push({
                    batchId: movement.id,
                    productName: product.name,
                    productSku: product.sku || '',
                    purchaseDate: movement.timestamp,
                    originalQty: qtyChange,
                    remainingQty: qtyChange,
                    unitCost: Number(movement.unit_cost) || 0,
                    supplierName: movement.supplier_name || '-',
                 });
              } else if (qtyChange < 0) {
                 // It's a sale/deduction, deduct from oldest batches
                 let qtyToDeduct = Math.abs(qtyChange);
                 
                 for (let i = 0; i < productBatches.length; i++) {
                    if (qtyToDeduct <= 0) break;
                    if (productBatches[i].remainingQty > 0) {
                       const deduct = Math.min(productBatches[i].remainingQty, qtyToDeduct);
                       productBatches[i].remainingQty -= deduct;
                       qtyToDeduct -= deduct;
                    }
                 }
              }
           }

           // Only keep batches that still have items left
           calculatedBatches.push(...productBatches.filter(b => b.remainingQty > 0));
        }

        // 4. Sort all active batches by purchase date (oldest first)
        calculatedBatches.sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());
        setAllBatches(calculatedBatches);

      } catch (error) {
        console.error("Error calculating batches:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadBatches();
  }, [supabase]);

  const totalAssetValue = useMemo(() => {
    return allBatches.reduce((total, batch) => {
      return total + batch.remainingQty * batch.unitCost;
    }, 0);
  }, [allBatches]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
                <CardTitle className="font-headline">Stock Batch List</CardTitle>
                <CardDescription>
                View all individual stock batches for your products, sorted with the oldest first (FIFO).
                </CardDescription>
            </div>
            {canSeeUnitCost && (
                <div className="text-right">
                    <p className="text-sm font-medium text-muted-foreground">Total Asset Value</p>
                    {isLoading ? (
                        <Skeleton className="h-8 w-32 mt-1" />
                    ) : (
                        <p className="text-2xl font-bold">₱{totalAssetValue.toFixed(2)}</p>
                    )}
                </div>
            )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product Name</TableHead>
              <TableHead className="hidden sm:table-cell">SKU</TableHead>
              <TableHead>Batch Date</TableHead>
              <TableHead>Supplier</TableHead>
              {canSeeUnitCost && <TableHead className="text-right">Unit Cost</TableHead>}
              <TableHead className="text-right">Remaining Qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  {canSeeUnitCost && (
                      <TableCell className="text-right">
                        <Skeleton className="h-4 w-16 ml-auto" />
                      </TableCell>
                  )}
                  <TableCell className="text-right">
                    <Skeleton className="h-4 w-12 ml-auto" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && paginatedData.map((batch) => (
              <TableRow key={batch.batchId}>
                <TableCell className="font-medium">{batch.productName}</TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">{batch.productSku}</TableCell>
                <TableCell>{format(new Date(batch.purchaseDate), 'MMM d, yyyy')}</TableCell>
                <TableCell>{batch.supplierName}</TableCell>
                {canSeeUnitCost && <TableCell className="text-right">₱{batch.unitCost.toFixed(2)}</TableCell>}
                <TableCell className="text-right font-bold">{batch.remainingQty}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        {!isLoading && allBatches.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
            <p className="text-lg font-semibold">No Stock Batches Found</p>
            <p className="text-muted-foreground mt-2">
                Restock products to see their batches appear here.
            </p>
            </div>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t p-4">
        <div className="text-sm text-muted-foreground">
          Showing <strong>{allBatches.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}-{Math.min(currentPage * itemsPerPage, allBatches.length)}</strong> of <strong>{allBatches.length}</strong> batches
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
            Previous
          </Button>
          <span className="text-sm font-medium mx-2">{currentPage} of {totalPages || 1}</span>
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0}>
            Next
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
