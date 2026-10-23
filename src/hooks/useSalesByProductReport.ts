'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { DateRange } from 'react-day-picker';
import {
  startOfToday,
  endOfToday,
  startOfYesterday,
  endOfYesterday,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import type { ProductSaleStat, ProductSalesSummary } from '@/types';
import { fetchOrdersInRange, fetchOrderItemsForOrders } from '@/lib/services/report-orders-service';

const VOID_ORDER_STATUSES = ['Cancelled', 'Returned'];

export type ProductSortOption = 'qty-desc' | 'qty-asc' | 'revenue-desc' | 'revenue-asc' | 'name-asc';

export function useSalesByProductReport(
  externalDate?: DateRange,
  externalSetDate?: (date: DateRange | undefined) => void
) {
  const supabase = useSupabase();
  const { user } = useUser();

  const [internalDate, setInternalDate] = useState<DateRange | undefined>({
    from: startOfToday(),
    to: endOfToday(),
  });

  const date = externalDate ?? internalDate;
  const setDate = externalSetDate ?? setInternalDate;

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<ProductSortOption>('qty-desc');
  const [productSales, setProductSales] = useState<ProductSaleStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const setDatePreset = useCallback((preset: 'today' | 'yesterday' | 'this-month') => {
    if (preset === 'today') {
      setDate({ from: startOfToday(), to: endOfToday() });
    } else if (preset === 'yesterday') {
      setDate({ from: startOfYesterday(), to: endOfYesterday() });
    } else if (preset === 'this-month') {
      const now = new Date();
      setDate({ from: startOfMonth(now), to: endOfMonth(now) });
    }
  }, [setDate]);

  useEffect(() => {
    if (!supabase || !user) return;
    if (!date?.from) {
      setProductSales([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const fromISO = date.from!.toISOString();
        const toDateObj = new Date(date.to || date.from!);
        toDateObj.setHours(23, 59, 59, 999);
        const toISO = toDateObj.toISOString();

        // 1. Fetch ALL orders in the selected date range without 1000-row cap truncation
        const validOrders = await fetchOrdersInRange(supabase, {
          selectCols: 'id, status, order_date, created_at',
          fromISO,
          toISO,
          dateColumn: 'order_date',
          statusesToExclude: VOID_ORDER_STATUSES,
        });

        if (validOrders.length === 0) {
          if (isMounted) {
            setProductSales([]);
            setIsLoading(false);
          }
          return;
        }

        const validOrderIds = validOrders.map((o: any) => o.id);

        // 2. Fetch order items in chunks to prevent row cap truncation
        const allItems = await fetchOrderItemsForOrders(
          supabase,
          validOrderIds,
          'order_id, product_id, product_name, quantity, selling_price_at_sale, products(name)'
        );

        // 3. Aggregate by product
        const map = new Map<string, {
          productId: string;
          name: string;
          qty: number;
          revenue: number;
          orderIds: Set<string>;
        }>();

        let totalRevenue = 0;

        allItems.forEach((item: any) => {
          const productId = item.product_id || item.product_name || 'unknown';
          const name = item.products?.name || item.product_name || 'Unknown Product';
          const qty = Number(item.quantity) || 0;
          const sellingPrice = Number(item.selling_price_at_sale) || 0;
          const revenue = qty * sellingPrice;

          totalRevenue += revenue;

          const existing = map.get(productId) || {
            productId,
            name,
            qty: 0,
            revenue: 0,
            orderIds: new Set<string>(),
          };

          existing.qty += qty;
          existing.revenue += revenue;
          if (item.order_id) {
            existing.orderIds.add(item.order_id);
          }

          map.set(productId, existing);
        });

        const stats: ProductSaleStat[] = Array.from(map.values()).map((p) => {
          const avgPrice = p.qty > 0 ? p.revenue / p.qty : 0;
          const percentageOfTotalRevenue = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0;
          return {
            productId: p.productId,
            name: p.name,
            qty: p.qty,
            revenue: p.revenue,
            ordersCount: p.orderIds.size,
            avgPrice,
            percentageOfTotalRevenue,
          };
        });

        if (isMounted) {
          setProductSales(stats);
        }
      } catch (err) {
        console.error('Sales by product error:', err);
        if (isMounted) setProductSales([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [supabase, user, date]);

  const filteredProductSales = useMemo(() => {
    let result = [...productSales];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'qty-desc':
          return b.qty - a.qty;
        case 'qty-asc':
          return a.qty - b.qty;
        case 'revenue-desc':
          return b.revenue - a.revenue;
        case 'revenue-asc':
          return a.revenue - b.revenue;
        case 'name-asc':
          return a.name.localeCompare(b.name);
        default:
          return b.qty - a.qty;
      }
    });

    return result;
  }, [productSales, searchTerm, sortBy]);

  const summary: ProductSalesSummary = useMemo(() => {
    const totalUnits = productSales.reduce((acc, p) => acc + p.qty, 0);
    const totalRevenue = productSales.reduce((acc, p) => acc + p.revenue, 0);
    const distinctProducts = productSales.length;
    const sortedByQty = [...productSales].sort((a, b) => b.qty - a.qty);
    const topProduct = sortedByQty.length > 0 ? `${sortedByQty[0].name} (${sortedByQty[0].qty} sold)` : null;

    return {
      totalUnits,
      totalRevenue,
      distinctProducts,
      topProduct,
    };
  }, [productSales]);

  return {
    date,
    setDate,
    setDatePreset,
    searchTerm,
    setSearchTerm,
    sortBy,
    setSortBy,
    isLoading,
    productSales,
    filteredProductSales,
    summary,
  };
}
