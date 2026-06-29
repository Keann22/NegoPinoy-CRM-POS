'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { Order, OrderStatus } from '@/types';

/**
 * useOrders
 * Fetches all orders (role-filtered) and resolves customer names.
 * Extracted from orders/page.tsx (lines 126–196).
 */
export function useOrders() {
  const supabase = useSupabase();
  const { user } = useUser();
  const { userProfile } = useUserProfile();

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [customerMap, setCustomerMap] = useState<Map<string, string>>(new Map());
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const refetch = useCallback(() => setRefetchTrigger(n => n + 1), []);

  // Fetch orders
  useEffect(() => {
    if (!supabase || !user || !userProfile) return;
    const fetchOrders = async () => {
      setIsLoadingOrders(true);
      try {
        const isSalesOnly = !userProfile.roles.some((r: string) =>
          ['Admin', 'Owner', 'Inventory'].includes(r)
        );
        let q = supabase
          .from('orders')
          .select('*')
          .order('order_date', { ascending: false });
        if (isSalesOnly) q = q.eq('sales_person_id', userProfile.id);
        const { data, error } = await q;
        if (error) throw error;

        setOrders(
          (data || []).map((o: any) => ({
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
          }))
        );
      } catch (err) {
        console.error('Error fetching orders:', err);
      } finally {
        setIsLoadingOrders(false);
      }
    };
    fetchOrders();
  }, [supabase, user, userProfile, refetchTrigger]);

  // Resolve customer names
  useEffect(() => {
    if (!orders || orders.length === 0 || !supabase) return;
    const fetchCustomers = async () => {
      setIsLoadingCustomers(true);
      try {
        const customerIds = Array.from(new Set(orders.map(o => o.customerId))).filter(Boolean);
        
        if (customerIds.length === 0) {
          setCustomerMap(new Map());
          return;
        }

        const map = new Map<string, string>();
        const chunkSize = 150;
        
        for (let i = 0; i < customerIds.length; i += chunkSize) {
          const chunk = customerIds.slice(i, i + chunkSize);
          const { data, error } = await supabase
            .from('customers')
            .select('id, full_name')
            .in('id', chunk);
            
          if (error) throw error;
          (data || []).forEach(c => map.set(c.id, c.full_name || 'Unknown Customer'));
        }
        
        setCustomerMap(map);
      } catch (err) {
        console.error('Error fetching customers for orders:', err);
      } finally {
        setIsLoadingCustomers(false);
      }
    };
    fetchCustomers();
  }, [orders, supabase]);

  return {
    orders,
    customerMap,
    isLoading: isLoadingOrders || isLoadingCustomers,
    refetch,
  };
}
