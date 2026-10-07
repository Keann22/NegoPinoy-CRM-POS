'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSupabase } from '@/lib/supabase/hooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ALL_OPEN_STATUSES, UNFULFILLED_STATUSES } from '@/lib/services/procurement-service';
import { fetchAllPages } from '@/lib/services/procurement-demand-service';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, CheckCircle2, Loader2, ExternalLink, ShoppingBag, Info, MousePointerClick } from 'lucide-react';
import { format } from 'date-fns';

interface ProcurementStockDetailDialogProps {
  item: any | null;
  isOpen: boolean;
  onClose: () => void;
}

type OrderCategory = 'allocated' | 'unscanned' | 'layaway' | 'all';

interface RelatedOrderRow {
  id: string;
  orderId: string;
  customerName: string;
  quantity: number;
  paymentMethod: string;
  status: string;
  orderDate: string;
  isPacked: boolean;
  category: Exclude<OrderCategory, 'all'>;
  viaBundle: boolean;
}

// Orders at these statuses were already physically pulled from the shelf.
const PICKED_STATUSES = ['Picked', 'Photo', 'Packed', 'For Shipping', 'For Pick-up', 'Picked (with issue)'];

export function ProcurementStockDetailDialog({ item, isOpen, onClose }: ProcurementStockDetailDialogProps) {
  const supabase = useSupabase();
  const [selectedCategory, setSelectedCategory] = useState<OrderCategory>('unscanned');
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderRows, setOrderRows] = useState<RelatedOrderRow[]>([]);

  const physicalStock = item?.physicalStock ?? 0;
  const layawayQty = item?.unscannedLayawayQty ?? 0;
  // needToBuyQty is net of pending-receipt POs; the card and its list count every
  // unscanned order piece, so use the pre-PO figure and show the PO cover separately.
  const openUnscanned = item?.openUnscannedQty ?? item?.needToBuyQty ?? 0;
  const coveredByPo = Math.max(0, openUnscanned - (item?.needToBuyQty ?? 0));
  // allocatedPickedQty from the service is (open demand − open unscanned), which still
  // contains on-shelf lay-away. Lay-away has its own card, so take it out here.
  const allocatedPicked = Math.max(
    0,
    (item?.allocatedPickedQty ?? Math.max(0, (item?.totalOpenDemandQty || 0) - openUnscanned)) - layawayQty
  );
  const unallocated = item?.unallocatedStock ?? Math.max(0, physicalStock - (item?.needToBuyQty || 0));

  useEffect(() => {
    let cancelled = false;

    async function fetchRelatedOrders() {
      if (!isOpen || !supabase || !item?.productId) return;
      setLoadingOrders(true);
      setOrderRows([]);
      try {
        const productId: string = item.productId;

        // Bundles hold no stock of their own: a bundle sale consumes this product,
        // so bundle order lines count here too (qty × qty-per-bundle).
        const bundles = await fetchAllPages<any>((from, to) =>
          supabase.from('products').select('id, assembly_recipe').not('assembly_recipe', 'is', null).range(from, to)
        );
        const qtyPerBundle = new Map<string, number>();
        bundles.forEach((bp: any) => {
          const recipe = Array.isArray(bp.assembly_recipe) ? bp.assembly_recipe : [];
          const perBundle = recipe
            .filter((c: any) => (c.productId || c.component_id) === productId)
            .reduce((sum: number, c: any) => sum + (c.quantity || 1), 0);
          if (perBundle > 0 && bp.id !== productId) qtyPerBundle.set(bp.id, perBundle);
        });

        const targetProductIds = [productId, ...Array.from(qtyPerBundle.keys())];
        const CHUNK_SIZE = 200;
        const data: any[] = [];
        const openIssues: any[] = [];

        // Same scope as the procurement demand calculation: open orders only, paginated.
        for (let i = 0; i < targetProductIds.length; i += CHUNK_SIZE) {
          const chunk = targetProductIds.slice(i, i + CHUNK_SIZE);
          const [chunkRows, chunkIssues] = await Promise.all([
            fetchAllPages<any>((from, to) =>
              supabase
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
                    customers(full_name)
                  )
                `)
                .in('product_id', chunk)
                .in('orders.status', ALL_OPEN_STATUSES)
                .order('id')
                .range(from, to)
            ),
            fetchAllPages<any>((from, to) =>
              supabase
                .from('order_issues')
                .select('order_id, product_id')
                .eq('status', 'open')
                .in('product_id', chunk)
                .order('id')
                .range(from, to)
            ),
          ]);
          data.push(...chunkRows);
          openIssues.push(...chunkIssues);
        }

        const openIssueKeys = new Set(openIssues.map((i: any) => `${i.order_id}-${i.product_id}`));

        // Mirrors isUnscannedLayaway / isUnfulfilledFor in procurement-demand-service.ts
        // so each list adds up to the number on its card.
        const categorize = (row: any): Exclude<OrderCategory, 'all'> => {
          const status = row.orders.status;
          if (row.orders.payment_method === 'Lay-away') {
            return !row.is_packed && !PICKED_STATUSES.includes(status) ? 'layaway' : 'allocated';
          }
          if (status === 'Picked (with issue)') {
            const hasOpenIssue =
              openIssueKeys.has(`${row.orders.id}-${productId}`) ||
              openIssueKeys.has(`${row.orders.id}-${row.product_id}`);
            return hasOpenIssue ? 'unscanned' : 'allocated';
          }
          if (row.is_packed) return 'allocated';
          return UNFULFILLED_STATUSES.includes(status) ? 'unscanned' : 'allocated';
        };

        const formatted: RelatedOrderRow[] = data
          .map((row: any) => ({
            id: row.id,
            orderId: row.orders?.id || '',
            customerName: row.orders?.customers?.full_name || 'Unknown Customer',
            quantity: (row.quantity || 0) * (row.product_id === productId ? 1 : qtyPerBundle.get(row.product_id) || 1),
            paymentMethod: row.orders?.payment_method || 'Cash',
            status: row.orders?.status || 'Processing',
            orderDate: row.orders?.order_date || new Date().toISOString(),
            isPacked: !!row.is_packed,
            category: categorize(row),
            viaBundle: row.product_id !== productId,
          }))
          .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());

        if (!cancelled) setOrderRows(formatted);
      } catch (err) {
        console.error('Error fetching related orders for stock detail:', err);
      } finally {
        if (!cancelled) setLoadingOrders(false);
      }
    }

    fetchRelatedOrders();
    return () => {
      cancelled = true;
    };
  }, [isOpen, supabase, item?.productId]);

  if (!item) return null;

  // Filter orders based on active category
  const filteredOrders = selectedCategory === 'all' ? orderRows : orderRows.filter((r) => r.category === selectedCategory);
  const filteredQty = filteredOrders.reduce((sum, r) => sum + r.quantity, 0);
  const filteredOrderCount = new Set(filteredOrders.map((r) => r.orderId)).size;

  const getCategoryTitle = () => {
    switch (selectedCategory) {
      case 'allocated':
        return 'Allocated / Picked Orders (Claimed Stock)';
      case 'unscanned':
        return 'Open Unscanned Orders (Awaiting Picking)';
      case 'layaway':
        return 'Active Lay-Away Orders';
      case 'all':
        return 'All Related Product Orders';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-2 border-b">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            Stock Breakdown: {item.productName}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            System Current Stock: <span className="font-semibold text-slate-800">{item.currentStock}</span>
            {item.supplierCode && <span className="ml-2 font-mono text-indigo-600">[{item.supplierCode}]</span>}
            <span className="ml-3 text-[11px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-medium">
              💡 Click any card below to view related orders
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-3 overflow-y-auto pr-1 flex-1">
          {/* Top Metric Cards - Interactive & Clickable */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`border rounded-lg p-3 text-center transition-all cursor-pointer text-left relative ${
                selectedCategory === 'all'
                  ? 'bg-slate-100 border-slate-400 ring-2 ring-slate-400 shadow-sm'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100/70'
              }`}
            >
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Physical Shelf Count</span>
              <span className="text-2xl font-extrabold text-slate-900 mt-0.5 block">{physicalStock}</span>
              <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                <MousePointerClick className="w-3 h-3" /> View all orders
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('allocated')}
              className={`border rounded-lg p-3 text-center transition-all cursor-pointer text-left relative ${
                selectedCategory === 'allocated'
                  ? 'bg-amber-100/80 border-amber-400 ring-2 ring-amber-400 shadow-sm'
                  : 'bg-amber-50/70 border-amber-200 hover:border-amber-300 hover:bg-amber-100/50'
              }`}
            >
              <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block">Allocated / Picked</span>
              <span className="text-2xl font-extrabold text-amber-900 mt-0.5 block">{allocatedPicked}</span>
              <span className="text-[10px] text-amber-700 flex items-center gap-1 mt-0.5">
                <MousePointerClick className="w-3 h-3" /> Click for picked orders
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center col-span-2 sm:col-span-1 text-left"
            >
              <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">Unallocated Stock</span>
              <span className="text-2xl font-extrabold text-emerald-700 mt-0.5 block">{unallocated}</span>
              <span className="text-[10px] text-emerald-600">Free available shelf stock</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('unscanned')}
              className={`border rounded-lg p-3 flex items-center justify-between text-left transition-all cursor-pointer ${
                selectedCategory === 'unscanned'
                  ? 'bg-blue-100/80 border-blue-400 ring-2 ring-blue-400 shadow-sm'
                  : 'bg-blue-50/70 border-blue-200 hover:border-blue-300 hover:bg-blue-100/50'
              }`}
            >
              <div>
                <span className="text-xs font-semibold text-blue-900 block">Open Unscanned Orders</span>
                <span className="text-[10px] text-blue-700 flex items-center gap-1">
                  <MousePointerClick className="w-3 h-3" /> Click for unscanned orders
                </span>
                {coveredByPo > 0 && (
                  <span className="text-[10px] text-blue-700 block">
                    {coveredByPo} covered by incoming PO · {item?.needToBuyQty ?? 0} to buy
                  </span>
                )}
              </div>
              <span className="text-2xl font-extrabold text-blue-900">{openUnscanned}</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('layaway')}
              className={`border rounded-lg p-3 flex items-center justify-between text-left transition-all cursor-pointer ${
                selectedCategory === 'layaway'
                  ? 'bg-purple-100/80 border-purple-400 ring-2 ring-purple-400 shadow-sm'
                  : 'bg-purple-50/70 border-purple-200 hover:border-purple-300 hover:bg-purple-100/50'
              }`}
            >
              <div>
                <span className="text-xs font-semibold text-purple-900 block">Active Lay-Away Stock</span>
                <span className="text-[10px] text-purple-700 flex items-center gap-1">
                  <MousePointerClick className="w-3 h-3" /> Click for lay-away orders
                </span>
              </div>
              <span className="text-2xl font-extrabold text-purple-900">{layawayQty}</span>
            </button>
          </div>

          {/* Related Orders Section */}
          <div className="border rounded-lg overflow-hidden bg-white shadow-sm mt-3">
            <div className="bg-slate-100 px-3 py-2 border-b flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" />
                {getCategoryTitle()}
              </span>
              <Badge variant="outline" className="text-[11px] bg-white">
                {filteredOrderCount} Order{filteredOrderCount !== 1 ? 's' : ''} · {filteredQty} pc{filteredQty !== 1 ? 's' : ''}
              </Badge>
            </div>

            {loadingOrders ? (
              <div className="flex justify-center items-center h-28">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No related orders found for this category.
              </div>
            ) : (
              <div className="max-h-[40vh] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-slate-50 text-[11px]">
                    <TableRow>
                      <TableHead className="w-28 py-2">Order ID</TableHead>
                      <TableHead className="py-2">Customer</TableHead>
                      <TableHead className="text-center py-2">Qty</TableHead>
                      <TableHead className="text-center py-2">Payment</TableHead>
                      <TableHead className="text-center py-2">Status</TableHead>
                      <TableHead className="text-right py-2">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {filteredOrders.map((row) => (
                      <TableRow key={row.id} className="hover:bg-slate-50/80">
                        <TableCell className="font-mono font-medium py-2">
                          <Link
                            href={`/dashboard/orders/${row.orderId}`}
                            target="_blank"
                            className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
                          >
                            #{row.orderId.slice(0, 8)}
                            <ExternalLink className="w-3 h-3 text-slate-400" />
                          </Link>
                        </TableCell>
                        <TableCell className="font-medium text-slate-800 py-2">{row.customerName}</TableCell>
                        <TableCell className="text-center font-bold text-slate-900 py-2">
                          {row.quantity}
                          {row.viaBundle && <span className="block text-[10px] font-normal text-slate-400">via bundle</span>}
                        </TableCell>
                        <TableCell className="text-center py-2">
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {row.paymentMethod}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center py-2">
                          <Badge
                            className={`text-[10px] font-medium border ${
                              row.isPacked || row.status === 'Packed'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : row.status === 'Picked (with issue)'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {row.isPacked ? 'Packed' : row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-slate-500 py-2 text-[11px]">
                          {format(new Date(row.orderDate), 'MMM d, h:mm a')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
