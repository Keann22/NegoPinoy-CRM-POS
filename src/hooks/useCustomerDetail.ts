'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import type { Order } from '@/app/dashboard/orders/page';
import type { StoreCreditEntry } from '@/components/dashboard/customers/StoreCreditLedgerTable';

export interface CustomerProfileData {
  id: string;
  psid?: string | null;
  fullName: string;
  email: string;
  mobileNumber?: string;
  addressLine?: string;
  region?: string;
  province?: string;
  city?: string;
  barangay?: string;
  postalCode?: string;
  streetAddress?: string;
  sukiTier?: string;
  facebookProfileLink?: string;
  storeCredit?: number;
}

export interface CustomerPaymentRecord {
  id: string;
  orderId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  notes?: string;
}

export function useCustomerDetail(customerId: string) {
  const supabase = useSupabase();
  const [customer, setCustomer] = useState<CustomerProfileData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<CustomerPaymentRecord[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<StoreCreditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!supabase || !customerId) return;
    let isCancelled = false;

    const fetchAll = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch customer
        const { data: custData, error: custErr } = await supabase
          .from('customers')
          .select('*')
          .eq('id', customerId)
          .single();
        if (custErr) throw custErr;
        if (!isCancelled && custData) {
          setCustomer({
            id: custData.id,
            psid: custData.psid,
            fullName: custData.full_name,
            email: custData.email,
            mobileNumber: custData.mobile_number,
            addressLine: custData.address_line,
            region: custData.region,
            province: custData.province,
            city: custData.city,
            barangay: custData.barangay,
            postalCode: custData.postal_code,
            streetAddress: custData.street_address,
            sukiTier: custData.suki_tier,
            facebookProfileLink: custData.facebook_profile_link,
            storeCredit: custData.store_credit,
          });
        }

        // 2. Fetch this customer's orders
        const { data: ordersData, error: ordersErr } = await supabase
          .from('orders')
          .select('*')
          .eq('customer_id', customerId)
          .order('order_date', { ascending: false });
        if (ordersErr) throw ordersErr;

        const mappedOrders: Order[] = ((ordersData as Record<string, unknown>[]) || []).map(
          (o) => ({
            id: String(o.id),
            customerId: String(o.customer_id),
            orderDate: String(o.order_date || ''),
            orderStatus: o.status as Order['orderStatus'],
            totalAmount: Number(o.total_amount || 0),
            balanceDue: Number(o.balance_due || 0),
            amountPaid: Number(o.amount_paid || 0),
            subtotal: Number(o.subtotal || 0),
            totalDiscount: Number(o.total_discount || 0),
            paymentType: o.payment_type as Order['paymentType'],
            installmentMonths: o.installment_months as number | undefined,
            monthlyPayment: o.monthly_payment as number | undefined,
            salesPersonName: o.sales_person_name as string | undefined,
            salesRepId: o.sales_rep_id as string | undefined,
            insurance_fee: o.insurance_fee as number | undefined,
            tracking_number: o.tracking_number as string | undefined,
            spx_sync_data: o.spx_sync_data as Record<string, unknown> | undefined,
          })
        );

        if (!isCancelled) {
          setOrders(mappedOrders);
        }

        // 3. Fetch payments only for those orders
        if (mappedOrders.length > 0) {
          const orderIds = mappedOrders.map((o) => o.id);
          const { data: paymentsData, error: paymentsErr } = await supabase
            .from('payments')
            .select('*')
            .in('order_id', orderIds)
            .order('payment_date', { ascending: false });
          if (paymentsErr) throw paymentsErr;
          if (!isCancelled) {
            setPayments(
              ((paymentsData as Record<string, unknown>[]) || []).map((p) => ({
                id: String(p.id),
                orderId: String(p.order_id),
                paymentDate: String(p.payment_date || ''),
                amount: Number(p.amount || 0),
                paymentMethod: String(p.payment_method || ''),
                notes: p.notes as string | undefined,
              }))
            );
          }
        } else if (!isCancelled) {
          setPayments([]);
        }

        // 4. Fetch store credit ledger
        const { data: ledgerData } = await supabase
          .from('store_credit_entries')
          .select('*')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false });
        if (!isCancelled) {
          setLedgerEntries((ledgerData as StoreCreditEntry[]) || []);
        }
      } catch (err) {
        console.error('useCustomerDetail fetch error:', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    fetchAll();
    return () => {
      isCancelled = true;
    };
  }, [supabase, customerId, refreshKey]);

  const { totalBalanceOwed, outstandingOrders } = useMemo(() => {
    if (!orders) return { totalBalanceOwed: 0, outstandingOrders: [] };
    const outstanding = orders.filter(
      (o) =>
        o.balanceDue > 0 &&
        o.orderStatus !== 'Cancelled' &&
        o.orderStatus !== 'Returned'
    );
    const total = outstanding.reduce((sum, o) => sum + o.balanceDue, 0);
    return { totalBalanceOwed: total, outstandingOrders: outstanding };
  }, [orders]);

  return {
    customer,
    orders,
    payments,
    ledgerEntries,
    isLoading,
    totalBalanceOwed,
    outstandingOrders,
    refresh,
  };
}
