import { useState, useEffect } from "react";
import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { AlertCircle, Clock, PackageX, MessageSquare, PauseCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSupabase } from "@/lib/supabase/hooks";
import type { Order } from "@/types";
import { OverdueOrderDialog } from "./overdue-order-dialog";

interface OverdueOrdersProps {
  orders: Order[];
  customerMap: Map<string, string>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOrderUpdated?: () => void;
}

interface OrderIssueSummary {
  count: number;
  productNames: string[];
}

interface OutOfStockItem {
  name: string;
  quantity: number;
}

/**
 * Order notes are appended as "[MMM d, yyyy h:mm a] Sender Name:\nmessage", separated by
 * blank lines (see handleSendNote in overdue-order-dialog.tsx). Pulls out just the most
 * recent entry so a card can show a one-line preview without opening the dialog.
 */
function getLatestNote(notes?: string | null): { sender: string; message: string } | null {
  if (!notes || !notes.trim()) return null;

  const entries = notes.split('\n\n').map((e) => e.trim()).filter(Boolean);
  if (entries.length === 0) return null;

  const last = entries[entries.length - 1];
  const match = last.match(/^\[.+?\]\s*(.+?):\s*([\s\S]*)$/);
  if (match) {
    return { sender: match[1].trim(), message: match[2].trim() };
  }
  return { sender: '', message: last };
}

export function OverdueOrders({ orders, customerMap, isExpanded, onToggleExpand, onOrderUpdated }: OverdueOrdersProps) {
  const supabase = useSupabase();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [issuesByOrderId, setIssuesByOrderId] = useState<Map<string, OrderIssueSummary>>(new Map());
  const [outOfStockByOrderId, setOutOfStockByOrderId] = useState<Map<string, OutOfStockItem[]>>(new Map());

  // Orders still waiting on fulfillment (not yet picked clean) that are older than 10 days.
  // "Picked (with issue)", "Waiting for Stock", and "On-Hold" are included because those
  // are exactly the orders most likely to be stuck (e.g. waiting on missing stock).
  const STUCK_STATUSES: Order["orderStatus"][] = [
    "Processing",
    "Picked (with issue)",
    "Waiting for Stock",
    "On-Hold",
  ];
  const overdueOrders = orders.filter((o) => {
    if (!STUCK_STATUSES.includes(o.orderStatus)) return false;
    if (o.paymentType === "Lay-away") return false;
    if (!o.orderDate) return false;

    const daysOverdue = differenceInDays(new Date(), new Date(o.orderDate));
    return daysOverdue > 10;
  });

  // Sort by oldest first
  overdueOrders.sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime());

  // Cross-reference with open inventory/order issues so a card can flag "this one is stuck on a reported issue"
  const fetchOrderIssues = () => {
    if (overdueOrders.length === 0) return;
    const overdueIds = new Set(overdueOrders.map((o) => o.id));

    fetch('/api/inventory/issues')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to fetch issues'))))
      .then((allIssues: any[]) => {
        const map = new Map<string, OrderIssueSummary>();
        (allIssues || []).forEach((issue) => {
          const orderId = issue.orders?.id;
          if (!orderId || !overdueIds.has(orderId)) return;

          const existing = map.get(orderId) || { count: 0, productNames: [] };
          existing.count += 1;
          if (issue.products?.name) existing.productNames.push(issue.products.name);
          map.set(orderId, existing);
        });
        setIssuesByOrderId(map);
      })
      .catch((e) => console.error("Failed to load order issues for overdue orders", e));
  };

  useEffect(() => {
    if (overdueOrders.length === 0) {
      setIssuesByOrderId(new Map());
      return;
    }

    fetchOrderIssues();
    const interval = setInterval(fetchOrderIssues, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // Independent of any reported issue: check whether the products actually inside these
  // overdue orders are currently out of stock, so a card can flag it even if nobody filed a report.
  useEffect(() => {
    if (!supabase || overdueOrders.length === 0) {
      setOutOfStockByOrderId(new Map());
      return;
    }

    const checkLiveStock = async () => {
      const overdueIds = overdueOrders.map((o) => o.id);
      if (overdueIds.length === 0) return;
      try {
        // 1. Find which orders have already been picked (so we don't flag them for out of stock)
        const { data: logData, error: logError } = await supabase
          .from('order_logs')
          .select('order_id')
          .in('order_id', overdueIds)
          .in('status', ['Picked', 'Photo', 'Packed', 'For Shipping', 'For Pick-up']);
          
        if (logError) throw logError;
        
        const alreadyPickedIds = new Set((logData || []).map(l => l.order_id));
        const idsToCheck = overdueIds.filter(id => !alreadyPickedIds.has(id));

        if (idsToCheck.length === 0) {
          setOutOfStockByOrderId(new Map());
          return;
        }

        // 2. Check live stock only for un-picked orders
        const rows: any[] = [];
        const chunkSize = 150;
        for (let i = 0; i < idsToCheck.length; i += chunkSize) {
          const chunk = idsToCheck.slice(i, i + chunkSize);
          const { data, error } = await supabase
            .from('order_items')
            .select('order_id, quantity, product_name, products(name, stock_level)')
            .in('order_id', chunk);
          if (error) throw error;
          rows.push(...(data || []));
        }

        const map = new Map<string, OutOfStockItem[]>();
        rows.forEach((row: any) => {
          const stock = row.products?.stock_level;
          if (stock === undefined || stock === null || stock > 0) return;

          const name = row.products?.name || row.product_name || 'Unknown product';
          const existing = map.get(row.order_id) || [];
          existing.push({ name, quantity: row.quantity });
          map.set(row.order_id, existing);
        });
        setOutOfStockByOrderId(map);
      } catch (e) {
        console.error("Failed to check live stock for overdue orders", e);
      }
    };

    checkLiveStock();
    const interval = setInterval(checkLiveStock, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, supabase]);

  if (overdueOrders.length === 0) {
    return null;
  }

  const displayedOrders = isExpanded ? overdueOrders : overdueOrders.slice(0, 6);
  const hasMore = overdueOrders.length > 6;

  return (
    <Card className="mb-6 border-red-200 bg-red-50/30 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Overdue Orders ({overdueOrders.length})
          </div>
          {hasMore && !isExpanded && (
            <Button variant="ghost" size="sm" onClick={onToggleExpand} className="text-red-700 hover:bg-red-100/50 hover:text-red-800">
              View All {overdueOrders.length}
            </Button>
          )}
          {isExpanded && (
            <Button variant="ghost" size="sm" onClick={onToggleExpand} className="text-red-700 hover:bg-red-100/50 hover:text-red-800">
              Close Expanded View
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {displayedOrders.map((order) => {
            const daysOverdue = differenceInDays(new Date(), new Date(order.orderDate));
            const issueSummary = issuesByOrderId.get(order.id);
            const outOfStockItems = outOfStockByOrderId.get(order.id);
            const latestNote = getLatestNote(order.notes);
            return (
              <div 
                key={order.id} 
                onClick={() => setSelectedOrder(order)}
                className="bg-white p-4 rounded-md border border-red-200 shadow-sm cursor-pointer hover:border-red-400 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <h4 className="font-semibold text-slate-900 text-sm flex justify-between items-start">
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="hover:underline hover:text-red-700 text-red-600 truncate mr-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Order #{order.id.substring(0, 7).toUpperCase()}
                    </Link>
                    <span className="shrink-0 text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {daysOverdue} days
                    </span>
                  </h4>
                  <p className="text-xs text-slate-600 font-medium mt-1 truncate">
                    {customerMap.get(order.customerId) || 'Unknown Customer'}
                  </p>

                  {order.orderStatus === 'On-Hold' && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                        <PauseCircle className="w-3 h-3" />
                        On Hold
                      </span>
                    </div>
                  )}

                  {issueSummary && (
                    <div className="mt-2">
                      <Badge variant="destructive" className="gap-1 font-normal">
                        <PackageX className="w-3 h-3" />
                        {issueSummary.productNames.length > 0 
                          ? (issueSummary.count === 1 ? 'Stock issue reported' : `${issueSummary.count} stock issues reported`)
                          : (issueSummary.count === 1 ? 'Manual issue reported' : `${issueSummary.count} manual issues reported`)}
                      </Badge>
                      {issueSummary.productNames.length > 0 && (
                        <p className="text-[11px] text-red-600 leading-snug mt-1">
                          {issueSummary.productNames.join(', ')}
                        </p>
                      )}
                    </div>
                  )}

                  {outOfStockItems && outOfStockItems.length > 0 && (
                    <div className="mt-2">
                      <Badge variant="outline" className="gap-1 font-normal bg-amber-100 text-amber-800 border-amber-300">
                        <PackageX className="w-3 h-3" />
                        Still out of stock
                      </Badge>
                      <p className="text-[11px] text-amber-700 leading-snug mt-1">
                        {outOfStockItems.map((i) => `${i.name} (x${i.quantity})`).join(', ')}
                      </p>
                    </div>
                  )}

                  {latestNote && (
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                        <MessageSquare className="w-3 h-3" />
                        {latestNote.sender || 'Latest note'}
                      </p>
                      <p className="text-xs text-slate-700 leading-snug line-clamp-2 mt-0.5">
                        {latestNote.message}
                      </p>
                    </div>
                  )}

                  <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                    <p>
                      Placed on: <span className="font-medium text-slate-800">{format(new Date(order.orderDate), "MMM d, yyyy")}</span>
                    </p>
                    <p className="mt-1">
                      Amount: <span className="font-medium text-slate-800">₱{(Number(order.totalAmount) || 0).toFixed(2)}</span>
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {(hasMore || isExpanded) && (
          <div className="mt-4 flex justify-center border-t border-red-100 pt-4">
            <Button variant="outline" onClick={onToggleExpand} className="w-full sm:w-auto border-red-200 text-red-700 hover:bg-red-50">
              {isExpanded ? "Back to All Orders" : "View All Overdue Orders"}
            </Button>
          </div>
        )}
      </CardContent>

      <OverdueOrderDialog
        order={selectedOrder}
        customerName={selectedOrder ? (customerMap.get(selectedOrder.customerId) || 'Unknown Customer') : ''}
        open={!!selectedOrder}
        onOpenChange={(open) => !open && setSelectedOrder(null)}
        onOrderUpdated={() => {
          if (onOrderUpdated) onOrderUpdated();
        }}
      />
    </Card>
  );
}
