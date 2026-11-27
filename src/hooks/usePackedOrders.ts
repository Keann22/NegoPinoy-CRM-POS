'use client';

import { useCallback, useEffect, useState } from 'react';
import { differenceInDays } from 'date-fns';
import { useSupabase } from '@/lib/supabase/hooks';
import type { Order } from '@/types';

export type PackedOrderRowData = Order & {
  customerName: string;
  daysPacked: number;
  packedDate: string;
  not_for_shipping_reason?: string | null;
  checkOn: string | null;
  hasOpenTask: boolean;
};

/** Fetches all Packed orders along with customer names, active hold check-dates, and open task flags. */
export function usePackedOrders() {
  const supabase = useSupabase();
  const [orders, setOrders] = useState<PackedOrderRowData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const refetch = useCallback(() => setRefetchTrigger((n) => n + 1), []);

  useEffect(() => {
    const onRefresh = () => refetch();
    window.addEventListener('ship-holds-changed', onRefresh);
    window.addEventListener('staff-tasks-changed', onRefresh);
    return () => {
      window.removeEventListener('ship-holds-changed', onRefresh);
      window.removeEventListener('staff-tasks-changed', onRefresh);
    };
  }, [refetch]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const { data: rawOrders, error } = await supabase
          .from('orders')
          .select('*')
          .eq('status', 'Packed')
          .order('order_date', { ascending: false });
        if (error) throw error;
        const rows = (rawOrders || []) as any[];
        if (rows.length === 0) {
          if (!cancelled) setOrders([]);
          return;
        }

        const orderIds = rows.map((o) => o.id as string);
        const customerIds = Array.from(new Set(rows.map((o) => o.customer_id).filter(Boolean))) as string[];

        const [custRes, holdsRes, tasksRes] = await Promise.all([
          customerIds.length > 0
            ? supabase.from('customers').select('id, full_name').in('id', customerIds)
            : Promise.resolve({ data: [] as any[], error: null }),
          supabase.from('order_ship_holds').select('order_id, check_on').in('order_id', orderIds).is('released_at', null),
          supabase.from('staff_tasks').select('order_id').in('order_id', orderIds).eq('status', 'open').or('kind.is.null,kind.neq.put_back'),
        ]);

        if (cancelled) return;
        const custMap = new Map<string, string>();
        for (const c of (custRes.data || []) as { id: string; full_name: string | null }[]) {
          custMap.set(c.id, c.full_name || 'Unknown');
        }

        const checkMap = new Map<string, string>();
        for (const h of (holdsRes.data || []) as { order_id: string; check_on: string | null }[]) {
          if (h.check_on && !checkMap.has(h.order_id)) checkMap.set(h.order_id, h.check_on);
        }

        const openTaskSet = new Set<string>(
          ((tasksRes.data || []) as { order_id: string | null }[]).map((t) => t.order_id).filter((id): id is string => !!id)
        );

        const mapped: PackedOrderRowData[] = rows.map((o) => {
          const packedDate = o.packed_at || o.order_date;
          return {
            id: o.id,
            customerId: o.customer_id,
            orderDate: o.order_date,
            orderStatus: o.status,
            subtotal: o.subtotal || o.total_amount || 0,
            totalDiscount: o.discount_amount || 0,
            totalAmount: o.total_amount || 0,
            paymentType: o.payment_method,
            amountPaid: o.amount_paid || 0,
            balanceDue: o.balance_due ?? 0,
            monthlyPayment: o.monthly_payment || 0,
            installmentMonths: o.installment_months || 0,
            shippingFee: o.shipping_fee,
            tracking_number: o.tracking_number,
            notes: o.notes,
            salesPersonId: o.sales_person_id,
            salesPersonName: o.sales_person_name,
            not_for_shipping_reason: o.not_for_shipping_reason,
            boxes_config: o.boxes_config,
            shipping_payment_type: o.shipping_payment_type,
            customerName: custMap.get(o.customer_id) || 'Unknown Customer',
            packedDate,
            daysPacked: differenceInDays(new Date(), new Date(packedDate)),
            checkOn: checkMap.get(o.id) || null,
            hasOpenTask: openTaskSet.has(o.id),
          };
        });

        setOrders(mapped);
      } catch (err) {
        console.error('Packed orders fetch error:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [supabase, refetchTrigger]);

  return { orders, isLoading, refetch };
}
