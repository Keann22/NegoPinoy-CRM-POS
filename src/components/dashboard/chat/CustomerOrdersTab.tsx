'use client';

import React from 'react';
import Link from 'next/link';
import { ShoppingBag, PlusCircle, ExternalLink } from 'lucide-react';
import type { CustomerOrderSummary } from '@/types';

interface CustomerOrdersTabProps {
  customerName: string;
  orders: CustomerOrderSummary[];
  onCreateOrder?: () => void;
}

export function CustomerOrdersTab({
  customerName,
  orders,
  onCreateOrder,
}: CustomerOrdersTabProps) {
  return (
    <div className="space-y-3">
      {onCreateOrder && (
        <button
          type="button"
          onClick={onCreateOrder}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>+ Create Order for {customerName.split(' ')[0]}</span>
        </button>
      )}

      {orders.length === 0 ? (
        <div className="p-8 text-center text-xs text-muted-foreground bg-background rounded-2xl border border-dashed border-border space-y-2">
          <ShoppingBag className="w-6 h-6 mx-auto opacity-40" />
          <p>No recorded orders yet for this customer.</p>
        </div>
      ) : (
        orders.map((order) => {
          const orderDateStr = order.order_date || order.created_at;
          const balanceDue = Number(order.balance_due || 0);

          return (
            <div
              key={order.id}
              className="bg-background border border-border/80 rounded-2xl p-3 space-y-2 shadow-2xs text-xs"
            >
              <div className="flex items-center justify-between">
                <Link
                  href={`/dashboard/orders/${order.id}`}
                  className="font-mono font-bold text-primary hover:underline flex items-center gap-1"
                >
                  <span>#{order.id.slice(0, 7).toUpperCase()}</span>
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </Link>
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                    order.status === 'Completed' ||
                    order.status === 'Shipped' ||
                    order.status === 'Payment Received (COD)'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : order.status === 'Cancelled' || order.status === 'Returned'
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {order.status}
                </span>
              </div>

              {/* Order items */}
              {order.order_items && order.order_items.length > 0 && (
                <div className="space-y-1 py-1 border-y border-border/40 text-[11px]">
                  {order.order_items.map((item, idx) => {
                    const unitPrice = Number(
                      item.selling_price_at_sale ?? item.unit_price ?? 0
                    );
                    return (
                      <div
                        key={idx}
                        className="flex justify-between items-center text-muted-foreground"
                      >
                        <span className="truncate pr-2">
                          {item.quantity}× {item.product_name}
                        </span>
                        <span className="font-medium text-foreground shrink-0">
                          ₱{Number(unitPrice * item.quantity).toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between text-xs pt-0.5">
                <span className="text-[10px] text-muted-foreground">
                  {orderDateStr
                    ? new Date(orderDateStr).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : ''}
                </span>
                <div className="text-right">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    ₱{Number(order.total_amount || 0).toLocaleString()}
                  </span>
                  {balanceDue > 0 &&
                    order.status !== 'Cancelled' &&
                    order.status !== 'Returned' && (
                      <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                        Bal: ₱{balanceDue.toLocaleString()}
                      </div>
                    )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
