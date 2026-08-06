'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import type { OrderItem, OrderStatus } from '@/types';

/**
 * A single message on an order_issue thread — the running discussion of why an
 * item is being held (picker report + sales replies).
 */
export interface OrderIssueMessage {
  id: string;
  sender_name: string | null;
  sender_role: string | null;
  message: string;
  created_at: string;
}

/**
 * An open order_issue tied to a specific product on this order. This is the
 * "why isn't it shipping" record: a picker (or the system) flagged the item as
 * short/out of stock, and the thread carries the back-and-forth.
 */
export interface OpenOrderIssue {
  id: string;
  product_id: string | null;
  out_of_stock_qty: number | null;
  reported_by_name: string | null;
  created_at: string;
  messages: OrderIssueMessage[];
}

/**
 * severity ranks how much attention a line needs, and drives the sort so the
 * worst offenders float to the top of the Order Items table:
 *   2 = reported issue (someone filed an order_issue — actively blocking)
 *   1 = out of stock, not yet reported (stock_level <= 0, no issue filed)
 *   0 = in stock / fine
 */
export type ItemSeverity = 0 | 1 | 2;

export interface EnrichedOrderItem extends OrderItem {
  stockLevel: number | null;
  issue: OpenOrderIssue | null;
  severity: ItemSeverity;
}

/**
 * Statuses where the order has already been picked/fulfilled (or is closed), so
 * live stock levels no longer say anything useful about whether it can ship —
 * the units are already committed/pulled. We skip the "out of stock (unreported)"
 * flag for these, but still surface any order_issue that somehow remains open.
 */
const FULFILLED_OR_CLOSED: OrderStatus[] = [
  'Picked', 'Picked (with issue)', 'Photo', 'Packed', 'For Shipping',
  'For Pick-up', 'Shipped', 'Completed', 'Cancelled', 'Returned',
  'Payment Received (COD)',
];

/**
 * Enriches an order's line items with live product stock and any open, product-
 * scoped order_issues, then sorts problem lines to the top. Powers the Order
 * Items card on the order detail page so staff can tell at a glance whether an
 * order is clear to ship or is being held on a specific item.
 */
export function useOrderItemsStatus(
  orderId: string,
  orderStatus: OrderStatus | undefined,
  items: OrderItem[],
) {
  const supabase = useSupabase();

  const [stockByProduct, setStockByProduct] = useState<Record<string, number | null>>({});
  const [issuesByProduct, setIssuesByProduct] = useState<Record<string, OpenOrderIssue>>({});
  const [isLoading, setIsLoading] = useState(false);

  const productIds = useMemo(
    () => Array.from(new Set(items.map(i => i.productId).filter(Boolean))),
    [items],
  );
  const productIdsKey = productIds.join(',');

  const load = useCallback(async () => {
    if (!supabase || !orderId || productIds.length === 0) {
      setStockByProduct({});
      setIssuesByProduct({});
      return;
    }
    setIsLoading(true);
    try {
      const [stockRes, issuesRes] = await Promise.all([
        supabase.from('products').select('id, stock_level').in('id', productIds),
        supabase
          .from('order_issues')
          .select('id, product_id, out_of_stock_qty, reported_by_name, created_at, order_issue_messages(id, sender_name, sender_role, message, created_at)')
          .eq('order_id', orderId)
          .eq('status', 'open'),
      ]);

      const stockMap: Record<string, number | null> = {};
      (stockRes.data || []).forEach((p: any) => { stockMap[p.id] = p.stock_level; });
      setStockByProduct(stockMap);

      const issueMap: Record<string, OpenOrderIssue> = {};
      (issuesRes.data || []).forEach((row: any) => {
        if (!row.product_id) return; // order-level issues aren't tied to a line
        const messages: OrderIssueMessage[] = (row.order_issue_messages || [])
          .slice()
          .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        // Keep the most recently reported issue per product if there are dupes.
        const existing = issueMap[row.product_id];
        if (!existing || new Date(row.created_at) > new Date(existing.created_at)) {
          issueMap[row.product_id] = {
            id: row.id,
            product_id: row.product_id,
            out_of_stock_qty: row.out_of_stock_qty,
            reported_by_name: row.reported_by_name,
            created_at: row.created_at,
            messages,
          };
        }
      });
      setIssuesByProduct(issueMap);
    } catch (err) {
      console.error('Failed to load order item stock/issues:', err);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, orderId, productIdsKey]);

  useEffect(() => { load(); }, [load]);

  const isSettled = orderStatus ? FULFILLED_OR_CLOSED.includes(orderStatus) : false;

  const enrichedItems = useMemo<EnrichedOrderItem[]>(() => {
    const rows = items.map((item): EnrichedOrderItem => {
      const stockLevel = item.productId in stockByProduct ? stockByProduct[item.productId] : null;
      const issue = issuesByProduct[item.productId] ?? null;
      let severity: ItemSeverity = 0;
      if (issue) severity = 2;
      else if (!isSettled && stockLevel !== null && stockLevel <= 0) severity = 1;
      return { ...item, stockLevel, issue, severity };
    });
    // Problems first (higher severity), otherwise preserve original order.
    return rows
      .map((row, idx) => ({ row, idx }))
      .sort((a, b) => b.row.severity - a.row.severity || a.idx - b.idx)
      .map(({ row }) => row);
  }, [items, stockByProduct, issuesByProduct, isSettled]);

  const problemCount = enrichedItems.filter(i => i.severity > 0).length;
  const reportedCount = enrichedItems.filter(i => i.severity === 2).length;

  return { enrichedItems, problemCount, reportedCount, isLoading, refetch: load };
}
