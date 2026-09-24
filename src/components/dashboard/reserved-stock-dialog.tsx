'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Activity, PauseCircle } from 'lucide-react';
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
  /**
   * When true, show ONLY items that have been packed (`is_packed = true`) — used
   * by the "Packed Stock Details" view. When false (default), packed items are
   * excluded, since the Reserved/Allocation views treat packed stock as already
   * handled.
   */
  packedOnly?: boolean;
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
  pickerReportedAt: string | null;
  pickerReportedBy: string | null;
};

export function ReservedStockDialog({ productId, productName, isOpen, onClose, statusFilter = ['Pending Payment', 'Processing'], excludeLayaway = false, title = "Reserved Stock Details", packedOnly = false }: ReservedStockDialogProps) {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [reservedOrders, setReservedOrders] = useState<ReservedOrder[]>([]);
  const [trailOrderId, setTrailOrderId] = useState<string | null>(null);
  const statusFilterKey = statusFilter.join(',');

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

        // 4. Fetch picker issues and logs to know when each item/order was last reported by the picker
        const orderIds = Array.from(
          new Set((data || []).map((item: any) => item.orders?.id).filter(Boolean) as string[])
        );

        let openIssueKeys = new Set<string>();
        // Map key: `${order_id}-${product_id}` -> { createdAt: string; reportedByName?: string }
        const itemPickerReportMap = new Map<string, { createdAt: string; reportedByName?: string }>();
        // Map key: `order_id` -> { createdAt: string; reportedByName?: string }
        const orderPickerReportMap = new Map<string, { createdAt: string; reportedByName?: string }>();

        if (orderIds.length > 0) {
          const { data: issuesData } = await supabase
            .from('order_issues')
            .select('order_id, product_id, status, created_at, reported_by_name')
            .in('order_id', orderIds)
            .order('created_at', { ascending: false });

          if (issuesData) {
            issuesData.forEach((issue: any) => {
              if (issue.status === 'open') {
                openIssueKeys.add(`${issue.order_id}-${issue.product_id}`);
              }
              const key = `${issue.order_id}-${issue.product_id}`;
              if (!itemPickerReportMap.has(key)) {
                itemPickerReportMap.set(key, {
                  createdAt: issue.created_at,
                  reportedByName: issue.reported_by_name || undefined,
                });
              }
              if (!orderPickerReportMap.has(issue.order_id)) {
                orderPickerReportMap.set(issue.order_id, {
                  createdAt: issue.created_at,
                  reportedByName: issue.reported_by_name || undefined,
                });
              }
            });
          }

          // Check order_logs for any 'Picked (with issue)' status logs
          const { data: logsData } = await supabase
            .from('order_logs')
            .select('order_id, status, user_name, created_at')
            .in('order_id', orderIds)
            .eq('status', 'Picked (with issue)')
            .order('created_at', { ascending: false });

          if (logsData) {
            logsData.forEach((log: any) => {
              const existing = orderPickerReportMap.get(log.order_id);
              if (!existing || new Date(log.created_at).getTime() > new Date(existing.createdAt).getTime()) {
                orderPickerReportMap.set(log.order_id, {
                  createdAt: log.created_at,
                  reportedByName: log.user_name || undefined,
                });
              }
            });
          }
        }

        let formattedOrders: ReservedOrder[] = (data || [])
          .filter((item: any) => {
            const hasOpenIssue = item.orders.status === 'Picked (with issue)' && (
              openIssueKeys.has(`${item.orders.id}-${item.product_id}`)
              || targetProductIds.some(tid => openIssueKeys.has(`${item.orders.id}-${tid}`))
            );

            // Packed view wants exactly the packed rows (excluding short items);
            // every other view treats packed stock as already handled and excludes it.
            if (packedOnly) return item.is_packed === true && !hasOpenIssue;

            // An open shortage issue wins over a stale is_packed flag because the
            // item is physically missing and still waiting to be fulfilled.
            if (hasOpenIssue) return true;

            if (item.is_packed) return false;

            if (item.orders.status === 'Picked (with issue)') {
              return false;
            }
            return true;
          })
          .map((item: any) => {
            const bundle = bundleInfo.get(item.product_id);

            // Find most specific picker report for this item (ordered product or component), falling back to order level
            const candidateProductIds = [item.product_id, ...targetProductIds];
            let report: { createdAt: string; reportedByName?: string } | undefined;
            for (const pid of candidateProductIds) {
              const candidate = itemPickerReportMap.get(`${item.orders.id}-${pid}`);
              if (candidate) {
                if (!report || new Date(candidate.createdAt).getTime() > new Date(report.createdAt).getTime()) {
                  report = candidate;
                }
              }
            }
            if (!report) {
              report = orderPickerReportMap.get(item.orders.id);
            }

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
              pickerReportedAt: report?.createdAt || null,
              pickerReportedBy: report?.reportedByName || null,
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
  }, [isOpen, productId, supabase, packedOnly, statusFilterKey, excludeLayaway]);

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
                  <TableHead>Age / Reported</TableHead>
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
                    <TableCell className="align-top">
                      <div className="space-y-1.5">
                        <div>
                          <span className="font-medium text-destructive">
                            {formatDistanceToNow(new Date(order.orderDate))} ago
                          </span>
                          <div className="text-xs text-muted-foreground">
                            Ordered: {format(new Date(order.orderDate), 'MMM d, yyyy')}
                          </div>
                        </div>
                        {order.pickerReportedAt && (
                          <div className="pt-1.5 border-t border-border/60 text-xs">
                            <span className="font-semibold text-amber-700 dark:text-amber-400 block">
                              Reported by picker:
                            </span>
                            <span className="font-medium text-foreground block">
                              {format(new Date(order.pickerReportedAt), 'MMM d, yyyy h:mm a')}
                            </span>
                            <span className="text-[11px] text-muted-foreground block">
                              ({formatDistanceToNow(new Date(order.pickerReportedAt))} ago{order.pickerReportedBy ? ` • ${order.pickerReportedBy}` : ''})
                            </span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="align-top font-medium">
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
                    <TableCell className="align-top font-mono text-sm">
                      <Link href={`/dashboard/orders/${order.fullOrderId}`} className="font-semibold text-primary hover:underline">
                        {order.orderId}
                      </Link>
                    </TableCell>
                    <TableCell className="align-top">
                      {order.status === 'On-Hold' ? (
                        <Badge className="gap-1 bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-100">
                          <PauseCircle className="h-3 w-3" />
                          On Hold
                        </Badge>
                      ) : (
                        <Badge variant={order.status === 'Pending Payment' ? 'destructive' : 'secondary'}>
                          {order.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-right font-bold text-lg">{order.quantity}</TableCell>
                    <TableCell className="align-top text-right">
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
