'use client';

import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { useSupabase } from '@/lib/supabase/hooks';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useEffect } from 'react';

type Supplier = {
  id: string;
  name: string;
};

type PurchaseHistoryItem = {
    productId: string;
    productName: string;
    batchId: string;
    purchaseDate: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
}

interface ViewSupplierHistoryDialogProps {
  supplier: Supplier | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ViewSupplierHistoryDialog({ supplier, open, onOpenChange }: ViewSupplierHistoryDialogProps) {
  const supabase = useSupabase();

  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryItem[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!supplier || !open || !supabase) return;

    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('inventory_movements')
          .select('id, timestamp, quantity_change, unit_cost, products(name)')
          .eq('supplier_name', supplier.name)
          .order('timestamp', { ascending: false });

        if (error) throw error;

        let total = 0;
        const history: PurchaseHistoryItem[] = (data || []).map((movement: any) => {
          const qty = movement.quantity_change || 0;
          const cost = Number(movement.unit_cost) || 0;
          const itemTotal = qty * cost;
          total += itemTotal;

          return {
            productId: '',
            productName: movement.products?.name || 'Unknown Product',
            batchId: movement.id,
            purchaseDate: movement.timestamp,
            quantity: qty,
            unitCost: cost,
            totalCost: itemTotal,
          };
        });

        setPurchaseHistory(history);
        setGrandTotal(total);
      } catch (error) {
        console.error('Failed to load purchase history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [supplier, open, supabase]);
  
  if (!supplier) {
      return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Purchase History for: {supplier.name}</DialogTitle>
          <DialogDescription>
            Showing all recorded purchases from this supplier.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
            <Table>
            <TableHeader>
                <TableRow>
                <TableHead>Product Name</TableHead>
                <TableHead>Purchase Date</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit Cost (₱)</TableHead>
                <TableHead className="text-right">Total Cost (₱)</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    </TableRow>
                ))}
                {!isLoading && purchaseHistory.map((item) => (
                <TableRow key={item.batchId}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell>{format(new Date(item.purchaseDate), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{item.unitCost.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{item.totalCost.toFixed(2)}</TableCell>
                </TableRow>
                ))}
            </TableBody>
             <TableFooter>
                <TableRow>
                    <TableCell colSpan={4} className="text-right font-bold">Grand Total</TableCell>
                    <TableCell className="text-right font-bold">
                        {isLoading ? <Skeleton className="h-5 w-24 ml-auto" /> : `₱${grandTotal.toFixed(2)}`}
                    </TableCell>
                </TableRow>
            </TableFooter>
            </Table>
            {!isLoading && purchaseHistory.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                    <p className="text-lg font-semibold">No Purchase History</p>
                    <p className="text-muted-foreground mt-2">
                        There are no recorded product purchases from this supplier.
                    </p>
                </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
