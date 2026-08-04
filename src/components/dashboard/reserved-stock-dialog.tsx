'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Activity } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OrderTrailDialog } from '@/components/dashboard/order-trail-dialog';

interface ReservedStockDialogProps {
  productId: string;
  productName: string;
  isOpen: boolean;
  onClose: () => void;
  statusFilter?: string[];
  excludeLayaway?: boolean;
  title?: string;
}

type ReservedOrder = {
  id: string;
  orderId: string;
  fullOrderId: string;
  customerId: string | null;
  customerName: string;
  paymentType: string;
  quantity: number;
  orderDate: string;
  status: string;
  viaBundleName: string | null;
};

export function ReservedStockDialog({ productId, productName, isOpen, onClose, statusFilter = ['Pending Payment', 'Processing'], excludeLayaway = false, title = "Reserved Stock Details" }: ReservedStockDialogProps) {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [reservedOrders, setReservedOrders] = useState<ReservedOrder[]>([]);
  const [trailOrderId, setTrailOrderId] = useState<string | null>(null);

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

        // 2. Find bundle/kit products that consume this item as a component
        // (e.g. "Wok Pan with Takip" = 1x Wok Pan + 1x Cover). An order for
        // the bundle never references this product_id directly in
        // order_items, so it has to be found via assembly_recipe. Only a
        // genuinely non-empty recipe makes a product a bundle, so ask the DB
        // for just those (`neq.[]`) instead of scanning the whole catalog on
        // every open. The Array.isArray guard below still drops stray values.
        const targetIdSet = new Set(targetProductIds);
        const { data: bundleData } = await supabase
          .from('products')
          .select('id, name, assembly_recipe')
          .neq('assembly_recipe', '[]');
        const bundleProducts: { id: string; name: string; assembly_recipe: any }[] = (bundleData || []) as any;

        // bundleProductId -> { name, qtyPerBundle }
        const bundleInfo = new Map<string, { name: string; qtyPerBundle: number }>();
        bundleProducts.forEach(bp => {
          const recipe = Array.isArray(bp.assembly_recipe) ? bp.assembly_recipe : [];
          const match = recipe.find((c: any) => targetIdSet.has(c.productId || c.component_id));
          if (match) bundleInfo.set(bp.id, { name: bp.name, qtyPerBundle: match.quantity || 1 });
        });

        // 3. Fetch reservations for the product itself/its variants, plus any
        // bundles that consume it.
        const allIdsToQuery = [...targetProductIds, ...Array.from(bundleInfo.keys())];
        const { data, error } = await supabase
          .from('order_items')
          .select(`
            id,
            product_id,
            quantity,
            is_packed,
            orders!inner(
              id,
              order_date,
              status,
              customer_id,
              payment_method,
              customers!inner(full_name)
            )
          `)
          .in('product_id', allIdsToQuery)
          .in('orders.status', statusFilter);

        if (error) throw error;

        // 4. If filtering by 'Picked (with issue)', we must ensure the specific item actually has an issue.
        // Otherwise, it was successfully picked and we shouldn't show it as needing stock.
        let openIssueKeys = new Set<string>();
        if (statusFilter.includes('Picked (with issue)')) {
          const { data: issuesData } = await supabase
            .from('order_issues')
            .select('order_id, product_id')
            .eq('status', 'open')
            .in('product_id', allIdsToQuery);
            
          openIssueKeys = new Set(issuesData?.map((i: any) => `${i.order_id}-${i.product_id}`));
        }

        let formattedOrders: ReservedOrder[] = (data || [])
          .filter((item: any) => {
            if (item.is_packed) return false;
            
            if (item.orders.status === 'Picked (with issue)') {
              return openIssueKeys.has(`${item.orders.id}-${item.product_id}`);
            }
            return true;
          })
          .map((item: any) => {
          const bundle = bundleInfo.get(item.product_id);
          return {
            id: item.id,
            orderId: item.orders.id.split('-')[0].toUpperCase(), // Short ID
            fullOrderId: item.orders.id,
            customerId: item.orders.customer_id || null,
            customerName: item.orders.customers?.full_name || 'Unknown',
            paymentType: item.orders.payment_method || 'Unknown',
            quantity: item.quantity * (bundle?.qtyPerBundle || 1),
            orderDate: item.orders.order_date,
            status: item.orders.status,
            viaBundleName: bundle?.name || null,
          };
        });

        if (excludeLayaway) {
          formattedOrders = formattedOrders.filter(o => o.paymentType !== 'Lay-away');
        }

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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Active orders for <span className="font-semibold text-foreground">{productName}</span>
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
                  <TableHead className="text-right">Trail</TableHead>
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
                    <TableCell className="font-medium">
                      {order.customerId ? (
                        <Link href={`/dashboard/customers/${order.customerId}`} className="text-primary hover:underline">
                          {order.customerName}
                        </Link>
                      ) : order.customerName}
                      <div className="text-xs text-muted-foreground font-normal mt-0.5">{order.paymentType}</div>
                      {order.viaBundleName && (
                        <div className="text-xs text-amber-600 font-normal mt-0.5">via {order.viaBundleName}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      <Link href={`/dashboard/orders/${order.fullOrderId}`} className="font-semibold text-primary hover:underline">
                        {order.orderId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={order.status === 'Pending Payment' ? 'destructive' : 'secondary'}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg">{order.quantity}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTrailOrderId(order.fullOrderId)}
                      >
                        <Activity className="mr-2 h-4 w-4" /> View Trail
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </DialogContent>

      {trailOrderId && (
        <OrderTrailDialog
          open={!!trailOrderId}
          onOpenChange={(open) => !open && setTrailOrderId(null)}
          orderId={trailOrderId}
        />
      )}
    </Dialog>
  );
}
