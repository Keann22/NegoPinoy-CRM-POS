'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { Order, OrderStatus } from '@/types';

/**
 * useOrders
 * Fetches all orders (role-filtered) and resolves customer names.
 *
 * Pages through with .range() rather than a single unfiltered .select() — a
 * single select silently caps at Supabase's 1000-row default (see
 * ARCHITECTURE.md, "The 1000-row query cap").
 *
 * Speed (phones on mobile data): the first page also returns the total count,
 * so the remaining pages are fetched in parallel instead of one after another,
 * and customer names come embedded in the same rows instead of 20+ separate
 * sequential lookups.
 */
const PAGE_SIZE = 1000;

export function useOrders() {
  const supabase = useSupabase();
  const { user } = useUser();
  const { userProfile } = useUserProfile();

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [customerMap, setCustomerMap] = useState<Map<string, string>>(new Map());
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const refetch = useCallback(() => setRefetchTrigger(n => n + 1), []);

  useEffect(() => {
    if (!supabase || !user || !userProfile) return;
    let cancelled = false;

    const fetchOrders = async () => {
      setIsLoadingOrders(true);
      try {
        const isSalesOnly = !userProfile.roles.some((r: string) =>
          ['Admin', 'Owner', 'Inventory'].includes(r)
        );
        const pageQuery = (from: number, withCount = false) => {
          let q = supabase
            .from('orders')
            .select('*, customer:customers(full_name)', withCount ? { count: 'exact' } : undefined)
            .order('order_date', { ascending: false })
            .order('id', { ascending: true }) // stable order so pages never overlap
            .range(from, from + PAGE_SIZE - 1);
          if (isSalesOnly) q = q.eq('sales_person_id', userProfile.id);
          return q;
        };

        const first = await pageQuery(0, true);
        if (first.error) throw first.error;
        const allRows: any[] = [...(first.data || [])];

        const total = first.count ?? allRows.length;
        if (allRows.length === PAGE_SIZE && total > PAGE_SIZE) {
          const offsets: number[] = [];
          for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) offsets.push(from);
          const pages = await Promise.all(offsets.map(from => pageQuery(from)));
          for (const page of pages) {
            if (page.error) throw page.error;
            allRows.push(...(page.data || []));
          }
        }

        if (cancelled) return;

        const seen = new Set<string>();
        const map = new Map<string, string>();
        const mapped: Order[] = [];
        for (const row of allRows) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          const { customer, ...o } = row;
          if (o.customer_id && customer) map.set(o.customer_id, customer.full_name || 'Unknown Customer');
          mapped.push({
            ...o,
            customerId: o.customer_id,
            orderDate: o.order_date,
            totalAmount: o.total_amount,
            amountPaid: o.amount_paid,
            balanceDue: o.balance_due,
            orderStatus: o.status as OrderStatus,
            paymentType: o.payment_method,
            installmentMonths: o.installment_months,
            monthlyPayment: o.monthly_payment,
            salesPersonName: o.sales_person_name,
            totalDiscount: o.total_discount,
          });
        }

        setCustomerMap(map);
        setOrders(mapped);
      } catch (err) {
        console.error('Error fetching orders:', err);
      } finally {
        if (!cancelled) setIsLoadingOrders(false);
      }
    };

    fetchOrders();
    return () => {
      cancelled = true;
    };
  }, [supabase, user, userProfile, refetchTrigger]);

  return {
    orders,
    customerMap,
    isLoading: isLoadingOrders,
    refetch,
  };
}
