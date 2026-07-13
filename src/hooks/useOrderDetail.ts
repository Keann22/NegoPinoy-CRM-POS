'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import type { Order, OrderItem } from '@/types';

type OrderDetailCustomer = {
  id: string;
  fullName: string;
  email: string;
  address?: string;
};

type OrderDetailPayment = {
  id: string;
  orderId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  notes?: string;
  proofUrl?: string;
};

/**
 * useOrderDetail
 * Consolidates the 4 separate useEffect fetches in orders/[id]/page.tsx
 * into a single, reusable hook.
 */
export function useOrderDetail(orderId: string) {
  const supabase = useSupabase();

  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<OrderDetailCustomer | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [payments, setPayments] = useState<OrderDetailPayment[]>([]);

  const [isLoadingOrder, setIsLoadingOrder] = useState(true);
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);

  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const refetch = useCallback(() => setRefetchTrigger(n => n + 1), []);

  // Fetch order
  useEffect(() => {
    if (!supabase || !orderId) return;
    const load = async () => {
      setIsLoadingOrder(true);
      try {
        const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if (error) throw error;
        if (data) {
          setOrder({
            id: data.id,
            customerId: data.customer_id,
            orderDate: data.order_date,
            orderStatus: data.status,
            totalAmount: data.total_amount,
            balanceDue: data.balance_due,
            amountPaid: data.amount_paid,
            subtotal: data.subtotal,
            totalDiscount: data.total_discount,
            paymentType: data.payment_method,
            installmentMonths: data.installment_months,
            monthlyPayment: data.monthly_payment,
            salesPersonName: data.sales_person_name,
            insurance_fee: data.insurance_fee,
            tracking_number: data.tracking_number,
            spx_sync_data: data.spx_sync_data,
          } as Order);
        }
      } catch (err) {
        console.error('Order fetch error:', err);
      } finally {
        setIsLoadingOrder(false);
      }
    };
    load();
  }, [supabase, orderId, refetchTrigger]);

  // Fetch customer once order is loaded
  useEffect(() => {
    if (!supabase || !order?.customerId) return;
    const load = async () => {
      setIsLoadingCustomer(true);
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('id, full_name, email, address_line, region, province, city, barangay, street_address')
          .eq('id', order.customerId)
          .single();
        if (error) throw error;
        if (data) {
          let address = '';
          if (data.region || data.province) {
            const parts: string[] = [];
            if (data.street_address) parts.push(data.street_address);
            if (data.barangay) parts.push(data.barangay);
            if (data.city) parts.push(data.city);
            if (data.province) parts.push(data.province);
            address = parts.join(', ');
          } else if (data.address_line) {
            address = data.address_line;
          }
          setCustomer({ id: data.id, fullName: data.full_name, email: data.email, address });
        }
      } catch (err) {
        console.error('Customer fetch error:', err);
      } finally {
        setIsLoadingCustomer(false);
      }
    };
    load();
  }, [supabase, order?.customerId]);

  // Fetch order items
  useEffect(() => {
    if (!supabase || !orderId) return;
    const load = async () => {
      setIsLoadingItems(true);
      try {
        const { data, error } = await supabase.from('order_items').select('*').eq('order_id', orderId);
        if (error) throw error;
        setOrderItems(
          (data || []).map((item: any) => ({
            id: item.id,
            orderId: item.order_id,
            productId: item.product_id,
            productName: item.product_name,
            quantity: item.quantity,
            costPriceAtSale: item.cost_price_at_sale,
            sellingPriceAtSale: item.selling_price_at_sale,
            discount: item.discount,
          }))
        );
      } catch (err) {
        console.error('Order items fetch error:', err);
      } finally {
        setIsLoadingItems(false);
      }
    };
    load();
  }, [supabase, orderId, refetchTrigger]);

  // Fetch payments
  useEffect(() => {
    if (!supabase || !orderId) return;
    const load = async () => {
      setIsLoadingPayments(true);
      try {
        const { data, error } = await supabase.from('payments').select('*').eq('order_id', orderId);
        if (error) throw error;
        setPayments(
          (data || []).map((p: any) => ({
            id: p.id,
            orderId: p.order_id,
            paymentDate: p.payment_date,
            amount: p.amount,
            paymentMethod: p.payment_method,
            notes: p.notes,
            proofUrl: p.proof_url,
          }))
        );
      } catch (err) {
        console.error('Payments fetch error:', err);
      } finally {
        setIsLoadingPayments(false);
      }
    };
    load();
  }, [supabase, orderId, refetchTrigger]);

  const isLoading = isLoadingOrder || isLoadingCustomer || isLoadingItems || isLoadingPayments;

  return { order, customer, orderItems, payments, isLoading, refetch };
}
