
'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type InventoryMovement = {
  id: string;
  productId: string;
  quantityChange: number;
  movementType: string;
  timestamp: string; // ISO string
  reason?: string;
};

type Product = {
  id: string;
  name: string;
  parentName?: string;
  variantName?: string;
};

interface ViewProductHistoryDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getMovementVariant = (type: string) => {
    const t = type.toLowerCase();
    if (t === 'sale' || t.includes('adjustment_down')) return 'destructive';
    if (t === 'restock' || t === 'initial_stock' || t.includes('adjustment_up')) return 'outline';
    return 'secondary';
}

export function ViewProductHistoryDialog({ product, open, onOpenChange }: ViewProductHistoryDialogProps) {
  const supabase = useSupabase();
  const { user } = useUser();

  const [localProduct, setLocalProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (product) setLocalProduct(product);
  }, [product]);

  const displayProduct = product || localProduct;

  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !user || !displayProduct || !open) return;
    const fetchMovements = async () => {
      setIsLoading(true);
      try {
        const [movementsRes, itemsRes] = await Promise.all([
          supabase
            .from('inventory_movements')
            .select('*')
            .eq('product_id', displayProduct.id)
            .order('timestamp', { ascending: false }),
          supabase
            .from('order_items')
            .select('order_id')
            .eq('product_id', displayProduct.id)
        ]);

        if (movementsRes.error) throw movementsRes.error;
        if (itemsRes.error) throw itemsRes.error;

        const baseMovements = (movementsRes.data || []).map((m: any) => ({
          id: m.id,
          productId: m.product_id,
          quantityChange: m.quantity_change,
          movementType: m.movement_type,
          timestamp: m.timestamp,
          reason: m.reason,
        }));

        let logMovements: InventoryMovement[] = [];
        const orderIds = Array.from(new Set((itemsRes.data || []).map((i: any) => i.order_id)));
        
        if (orderIds.length > 0) {
          // Chunk orderIds to avoid URL too long errors on Supabase GET
          const chunkSize = 150;
          const chunks = [];
          for (let i = 0; i < orderIds.length; i += chunkSize) {
            chunks.push(orderIds.slice(i, i + chunkSize));
          }

          const logsPromises = chunks.map(chunk => 
            supabase
              .from('order_logs')
              .select('*')
              .in('order_id', chunk)
          );

          const logsResults = await Promise.all(logsPromises);
          const allLogs = logsResults.flatMap(res => res.data || []);

          // Filter to physical/operational statuses that mean something for the item lifecycle
          const relevantStatuses = ['Picked', 'Packed', 'Shipped', 'Completed', 'Returned', 'Picked (with issue)', 'Waiting for Stock', 'Cancelled'];
          
          logMovements = allLogs
            .filter((log: any) => relevantStatuses.includes(log.status))
            .map((log: any) => ({
              id: `log-${log.id}`,
              productId: displayProduct.id,
              quantityChange: 0,
              movementType: log.status, // We use the status as the movement type so the UI badge reflects it
              timestamp: log.created_at,
              reason: `Order #${log.order_id.substring(0, 8).toUpperCase()} ${log.status.toLowerCase()}${log.user_name ? ` by ${log.user_name}` : ''}`
            }));
        }

        const combined = [...baseMovements, ...logMovements].sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        setMovements(combined);
      } catch (err) {
        console.error('Inventory movement fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMovements();
  }, [supabase, user, displayProduct, open]);

  if (!displayProduct) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Inventory History: {displayProduct.parentName
            ? `${displayProduct.parentName} — ${displayProduct.variantName || displayProduct.name}`
            : displayProduct.name}</DialogTitle>
          <DialogDescription>
            Audit log of all stock changes for this product.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty Change</TableHead>
                <TableHead>Reason / Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  </TableRow>
                ))}
              {!isLoading && movements && movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {format(new Date(m.timestamp), 'MMM d, yyyy h:mm a')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getMovementVariant(m.movementType)} className="capitalize">
                      {m.movementType.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className={cn(
                    "text-right font-medium",
                    m.quantityChange > 0 ? "text-green-600" : "text-destructive"
                  )}>
                    {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground italic">
                    {(() => {
                      if (!m.reason) return '—';
                      const uuidRegex = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
                      if (!uuidRegex.test(m.reason)) {
                        return m.reason;
                      }
                      
                      uuidRegex.lastIndex = 0;
                      const parts = m.reason.split(uuidRegex);
                      
                      return (
                        <>
                          {parts.map((part, index) => {
                            if (part.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                              return (
                                <Link 
                                  key={index}
                                  href={`/dashboard/orders/${part}`}
                                  className="text-primary hover:underline font-medium not-italic"
                                >
                                  #{part.split('-')[0].toUpperCase()}
                                </Link>
                              );
                            }
                            return <span key={index}>{part}</span>;
                          })}
                        </>
                      );
                    })()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!isLoading && movements.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-12">
              <p className="text-muted-foreground italic">No movement history found for this product.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
