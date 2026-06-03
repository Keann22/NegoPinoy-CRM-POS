'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ReservedStockDialogProps {
  productId: string;
  productName: string;
  isOpen: boolean;
  onClose: () => void;
}

type ReservedOrder = {
  id: string;
  orderId: string;
  customerName: string;
  quantity: number;
  orderDate: string;
  status: string;
};

export function ReservedStockDialog({ productId, productName, isOpen, onClose }: ReservedStockDialogProps) {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [reservedOrders, setReservedOrders] = useState<ReservedOrder[]>([]);

  useEffect(() => {
    async function fetchReservedOrders() {
      if (!isOpen || !supabase || !productId) return;
      
      setLoading(true);
      try {
        // 1. Get the product and any of its children if it's a parent
        const { data: family } = await supabase
          .from('products')
          .select('id')
          .or(`id.eq.${productId},parent_id.eq.${productId}`);
        
        const targetProductIds = (family || []).map(f => f.id);

        if (targetProductIds.length === 0) {
            setReservedOrders([]);
            setLoading(false);
            return;
        }

        // 2. Fetch reservations for any of these IDs
        const { data, error } = await supabase
          .from('order_items')
          .select(`
            quantity,
            orders!inner(
              id,
              order_date,
              status,
              customers!inner(name)
            )
          `)
          .in('product_id', targetProductIds)
          .in('orders.status', ['Pending Payment', 'Processing']);
        
        if (error) throw error;

        const formattedOrders: ReservedOrder[] = (data || []).map((item: any) => ({
          id: item.orders.id,
          orderId: item.orders.id.split('-')[0].toUpperCase(), // Short ID
          customerName: item.orders.customers?.name || 'Unknown',
          quantity: item.quantity,
          orderDate: item.orders.order_date,
          status: item.orders.status,
        }));

        formattedOrders.sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime());

        setReservedOrders(formattedOrders);
      } catch (err) {
        console.error("Failed to fetch reserved orders", err);
      } finally {
        setLoading(false);
      }
    }

    fetchReservedOrders();
  }, [isOpen, productId, supabase]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Reserved Stock Details</DialogTitle>
          <DialogDescription>
            Active reservations for <span className="font-semibold text-foreground">{productName}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : reservedOrders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No active reservations found for this product.
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Age</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservedOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <span className="font-medium text-destructive">
                          {formatDistanceToNow(new Date(order.orderDate))} ago
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(order.orderDate), 'MMM d, yyyy')}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{order.customerName}</TableCell>
                    <TableCell className="font-mono text-sm">{order.orderId}</TableCell>
                    <TableCell>
                      <Badge variant={order.status === 'Pending Payment' ? 'destructive' : 'secondary'}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg">{order.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
