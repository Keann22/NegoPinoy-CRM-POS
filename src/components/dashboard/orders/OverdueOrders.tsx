import { useState } from "react";
import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { AlertCircle, Clock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Order } from "@/types";
import { OverdueOrderDialog } from "./overdue-order-dialog";

interface OverdueOrdersProps {
  orders: Order[];
  customerMap: Map<string, string>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOrderUpdated?: () => void;
}

export function OverdueOrders({ orders, customerMap, isExpanded, onToggleExpand, onOrderUpdated }: OverdueOrdersProps) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  // Only orders in "Processing" that are older than 10 days
  const overdueOrders = orders.filter((o) => {
    if (o.orderStatus !== "Processing") return false;
    if (o.paymentType === "Lay-away") return false;
    if (!o.orderDate) return false;
    
    const daysOverdue = differenceInDays(new Date(), new Date(o.orderDate));
    return daysOverdue > 10;
  });

  // Sort by oldest first
  overdueOrders.sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime());

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
