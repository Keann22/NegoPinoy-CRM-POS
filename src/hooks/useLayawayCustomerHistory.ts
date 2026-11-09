import { useState } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import type { LayawayCustomerHistoryOrder } from '@/types/accounting.types';

interface RawOrderItemRow {
  order_id: string;
  product_name: string;
  quantity: number;
}

interface RawCustomerHistoryRow {
  id: string;
  created_at: string;
  order_date: string | null;
  status: string;
  payment_method: string;
  total_amount: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  tracking_number: string | null;
  notes: string | null;
}

export function useLayawayCustomerHistory() {
  const supabase = useSupabase();
  const { toast } = useToast();

  const [historyOrders, setHistoryOrders] = useState<LayawayCustomerHistoryOrder[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyCustomerName, setHistoryCustomerName] = useState<string>('');

  const fetchCustomerHistory = async (customerId?: string, customerName?: string) => {
    if (!supabase) return;
    setIsHistoryLoading(true);
    setHistoryCustomerName(customerName || 'Customer');
    setHistoryOrders([]);

    try {
      let query = supabase
        .from('orders')
        .select(`
          id,
          created_at,
          order_date,
          status,
          payment_method,
          total_amount,
          amount_paid,
          balance_due,
          tracking_number,
          notes
        `)
        .order('created_at', { ascending: false });

      if (customerId) {
        query = query.eq('customer_id', customerId);
      } else if (customerName) {
        query = query.ilike('shipping_name', `%${customerName}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rawHistory = (data || []) as RawCustomerHistoryRow[];
      if (rawHistory.length === 0) {
        setHistoryOrders([]);
        return;
      }

      const orderIds = rawHistory.map((o: RawCustomerHistoryRow) => o.id);
      const itemsMap = new Map<string, string[]>();

      for (let i = 0; i < orderIds.length; i += 200) {
        const chunk = orderIds.slice(i, i + 200);
        const { data: items } = await supabase
          .from('order_items')
          .select('order_id, product_name, quantity')
          .in('order_id', chunk);

        const typedItems = (items || []) as RawOrderItemRow[];
        typedItems.forEach((it: RawOrderItemRow) => {
          if (!itemsMap.has(it.order_id)) {
            itemsMap.set(it.order_id, []);
          }
          itemsMap.get(it.order_id)!.push(`${it.product_name} (x${it.quantity})`);
        });
      }

      const historyList: LayawayCustomerHistoryOrder[] = rawHistory.map((o: RawCustomerHistoryRow) => ({
        id: o.id,
        orderDate: o.order_date || o.created_at,
        status: o.status,
        paymentMethod: o.payment_method,
        totalAmount: o.total_amount || 0,
        amountPaid: o.amount_paid || 0,
        balanceDue: o.balance_due || 0,
        trackingNumber: o.tracking_number || undefined,
        notes: o.notes || undefined,
        itemsSummary: (itemsMap.get(o.id) || []).join(', ') || 'No items',
      }));

      setHistoryOrders(historyList);
    } catch (err: unknown) {
      console.error('Error fetching customer history:', err);
      toast({
        variant: 'destructive',
        title: 'Error loading customer history',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsHistoryLoading(false);
    }
  };

  return {
    fetchCustomerHistory,
    historyOrders,
    isHistoryLoading,
    historyCustomerName,
  };
}
