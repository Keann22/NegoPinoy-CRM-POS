'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSupabase } from '@/lib/supabase/hooks';
import type { PrintableProduct } from '@/hooks/useAllProductsForPrint';

interface AllocationRow {
  orderId: string;
  customerId: string | null;
  customerName: string;
  quantity: number;
  status: string;
}

/**
 * Every order status except the ones where the item has definitively left the building
 * or the order was voided. Deliberately broader than the "reservedStock"/"packedStock"
 * convention on the Products page (which only counts Processing/Packed/For Shipping/
 * For Pick-up) — here the goal is "who is still waiting on this item," which should
 * also include On-Hold, Waiting for Stock, and pre-pick statuses.
 */
const IN_FLIGHT_STATUSES = [
  'Pending Payment', 'Processing', 'Picked', 'Picked (with issue)', 'Photo',
  'Packed', 'For Shipping', 'For Pick-up', 'On-Hold', 'Waiting for Stock',
];

interface ProductAllocationDialogProps {
  product: PrintableProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function displayName(p: PrintableProduct) {
  return p.variant_name ? `${p.name} [${p.variant_name}]` : p.name;
}

export function ProductAllocationDialog({ product, open, onOpenChange }: ProductAllocationDialogProps) {
  const supabase = useSupabase();
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open || !product || !supabase) return;
    setIsLoading(true);
    setAllocations([]);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('order_items')
          .select('order_id, quantity, orders!inner(status, customer_id, customers(full_name))')
          .eq('product_id', product.id)
          .in('orders.status', IN_FLIGHT_STATUSES);
        if (error) { console.error('Error fetching product allocation:', error); return; }
        const rows: AllocationRow[] = (data || []).map((r: any) => ({
          orderId: r.order_id,
          customerId: r.orders?.customer_id || null,
          customerName: r.orders?.customers?.full_name || 'Unknown Customer',
          quantity: r.quantity,
          status: r.orders?.status || '-',
        }));
        setAllocations(rows);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [open, product, supabase]);

  if (!product) return null;

  const isNegative = (product.stock_level ?? 0) < 0;
  const totalAllocated = allocations.reduce((sum, a) => sum + a.quantity, 0);
  const photo = product.images?.[0] || 'https://placehold.co/128x128';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{displayName(product)}</DialogTitle>
          <DialogDescription>Stock and allocation details for this product.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-4">
          <img src={photo} alt={displayName(product)} className="w-24 h-24 object-cover rounded-md border shrink-0" />
          <div className="flex-1 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">SKU</span><span>{product.sku || '-'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Shelf Location</span><span>{product.shelf_location || '-'}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">System Stock</span>
              <Badge variant={isNegative ? 'destructive' : 'outline'}>{product.stock_level ?? 0}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Allocated to Orders</span>
              <span className="font-semibold">{totalAllocated}</span>
            </div>
          </div>
        </div>

        <div className="mt-2">
          <p className="text-sm font-medium mb-2">
            {isNegative ? 'Customers currently holding this item' : 'Orders currently holding this item'}
          </p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : allocations.length > 0 ? (
            <div className="border rounded-md max-h-[240px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocations.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">
                        {a.customerId ? (
                          <Link href={`/dashboard/customers/${a.customerId}`} className="text-primary hover:underline">
                            {a.customerName}
                          </Link>
                        ) : a.customerName}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <Link href={`/dashboard/orders/${a.orderId}`} className="font-semibold text-primary hover:underline">
                          #{a.orderId.slice(0, 7).toUpperCase()}
                        </Link>
                      </TableCell>
                      <TableCell><Badge variant="secondary">{a.status}</Badge></TableCell>
                      <TableCell className="text-right">{a.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No in-flight orders currently reference this product
              {isNegative ? ' — the shortfall likely traces back to an already-completed order.' : '.'}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
