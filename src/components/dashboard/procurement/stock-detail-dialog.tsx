'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSupabase } from '@/lib/supabase/hooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
}

export function ProcurementStockDetailDialog({ item, isOpen, onClose }: ProcurementStockDetailDialogProps) {
  const supabase = useSupabase();
  const [selectedCategory, setSelectedCategory] = useState<OrderCategory>('unscanned');
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderRows, setOrderRows] = useState<RelatedOrderRow[]>([]);

  const physicalStock = item?.physicalStock ?? 0;
  const allocatedPicked = item?.allocatedPickedQty ?? Math.max(0, (item?.totalOpenDemandQty || 0) - (item?.needToBuyQty || 0));
  const unallocated = item?.unallocatedStock ?? Math.max(0, physicalStock - (item?.needToBuyQty || 0));
  const openUnscanned = item?.needToBuyQty ?? 0;
  const layawayQty = item?.unscannedLayawayQty ?? 0;

  useEffect(() => {
    async function fetchRelatedOrders() {
      if (!isOpen || !supabase || !item?.productId) return;
      setLoadingOrders(true);
      try {
        // Fetch product family IDs (product itself + variants)
        const { data: family } = await supabase
          .from('products')
          .select('id')
          .or(`id.eq.${item.productId},parent_id.eq.${item.productId}`);

        const targetProductIds = (family && family.length > 0) ? family.map((f: any) => f.id) : [item.productId];

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
              customers(full_name)
            )
          `)
          .in('product_id', targetProductIds);

        if (error) throw error;

        const formatted: RelatedOrderRow[] = (data || []).map((row: any) => ({
          id: row.id,
          orderId: row.orders?.id || '',
          customerName: row.orders?.customers?.full_name || 'Unknown Customer',
          quantity: row.quantity || 1,
          paymentMethod: row.orders?.payment_method || 'Cash',
          status: row.orders?.status || 'Processing',
          orderDate: row.orders?.order_date || new Date().toISOString(),
          isPacked: !!row.is_packed,
        }));

        setOrderRows(formatted);
      } catch (err) {
        console.error('Error fetching related orders for stock detail:', err);
      } finally {
        setLoadingOrders(false);
      }
    }

    fetchRelatedOrders();
  }, [isOpen, supabase, item?.productId]);

  if (!item) return null;

  // Filter orders based on active category
  const filteredOrders = orderRows.filter((r) => {
    if (selectedCategory === 'allocated') {
      return r.isPacked || ['Picked', 'Photo', 'Packed', 'For Shipping', 'For Pick-up', 'Picked (with issue)', 'Completed'].includes(r.status);
    }
    if (selectedCategory === 'unscanned') {
      return !r.isPacked && r.paymentMethod !== 'Lay-away' && ['Processing', 'Pending Payment', 'Waiting for Stock', 'On-Hold'].includes(r.status);
    }
    if (selectedCategory === 'layaway') {
      return r.paymentMethod === 'Lay-away' && !['Completed', 'Cancelled'].includes(r.status);
    }
    return true; // 'all'
  });

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
                {filteredOrders.length} Order{filteredOrders.length !== 1 ? 's' : ''}
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
              <ScrollArea className="max-h-[220px]">
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
                        <TableCell className="text-center font-bold text-slate-900 py-2">{row.quantity}</TableCell>
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
              </ScrollArea>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
