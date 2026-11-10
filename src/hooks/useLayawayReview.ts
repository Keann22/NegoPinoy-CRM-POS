import { useState, useEffect, useCallback } from 'react';
import { differenceInDays, parseISO, format } from 'date-fns';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import type { LayawayReviewOrder } from '@/types/accounting.types';

interface RawOrderRow {
  id: string;
  created_at: string;
  order_date: string | null;
  customer_id: string | null;
  sales_person_name: string | null;
  total_amount: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  status: string;
  notes: string | null;
  tracking_number: string | null;
  shipping_name: string | null;
  shipping_phone: string | null;
}

interface RawCustomerRow {
  id: string;
  full_name: string | null;
  mobile_number: string | null;
}

interface RawOrderItemRow {
  order_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}

interface RawPaymentRow {
  order_id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
}

export function useLayawayReview() {
  const supabase = useSupabase();
  const { toast } = useToast();

  const [orders, setOrders] = useState<LayawayReviewOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const fetchLayaways = useCallback(async () => {
    if (!supabase) return;
    setIsLoading(true);

    try {
      // 1. Fetch all open lay-away orders in Processing
      const { data: rawOrdersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          order_date,
          customer_id,
          sales_person_name,
          total_amount,
          amount_paid,
          balance_due,
          status,
          notes,
          tracking_number,
          shipping_name,
          shipping_phone
        `)
        .eq('payment_method', 'Lay-away')
        .eq('status', 'Processing')
        .order('created_at', { ascending: true });

      if (ordersError) throw ordersError;
      const rawOrders = (rawOrdersData || []) as RawOrderRow[];
      if (rawOrders.length === 0) {
        setOrders([]);
        setIsLoading(false);
        return;
      }

      const orderIds = rawOrders.map((o: RawOrderRow) => o.id);
      const customerIds = Array.from(
        new Set(rawOrders.map((o: RawOrderRow) => o.customer_id).filter((id): id is string => Boolean(id)))
      );

      // 2. Fetch customer names and phones
      const customerMap = new Map<string, { name: string; phone: string }>();
      if (customerIds.length > 0) {
        for (let i = 0; i < customerIds.length; i += 200) {
          const chunk = customerIds.slice(i, i + 200);
          const { data: customersData } = await supabase
            .from('customers')
            .select('id, full_name, mobile_number')
            .in('id', chunk);

          const typedCustomers = (customersData || []) as RawCustomerRow[];
          typedCustomers.forEach((c: RawCustomerRow) => {
            customerMap.set(c.id, {
              name: c.full_name || 'No Name',
              phone: c.mobile_number || '-',
            });
          });
        }
      }

      // 3. Fetch order items
      const itemsMap = new Map<string, Array<{ name: string; quantity: number; unitPrice: number }>>();
      for (let i = 0; i < orderIds.length; i += 200) {
        const chunk = orderIds.slice(i, i + 200);
        const { data: itemsData } = await supabase
          .from('order_items')
          .select('order_id, product_name, quantity, unit_price')
          .in('order_id', chunk);

        const typedItems = (itemsData || []) as RawOrderItemRow[];
        typedItems.forEach((item: RawOrderItemRow) => {
          if (!itemsMap.has(item.order_id)) {
            itemsMap.set(item.order_id, []);
          }
          itemsMap.get(item.order_id)!.push({
            name: item.product_name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
          });
        });
      }

      // 4. Fetch payments to find latest payment date, amount, method
      const paymentsMap = new Map<string, { date: string; amount: number; method: string }>();
      for (let i = 0; i < orderIds.length; i += 200) {
        const chunk = orderIds.slice(i, i + 200);
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('order_id, payment_date, amount, payment_method')
          .neq('payment_method', 'Store Credit')
          .in('order_id', chunk)
          .order('payment_date', { ascending: false });

        const typedPayments = (paymentsData || []) as RawPaymentRow[];
        typedPayments.forEach((p: RawPaymentRow) => {
          if (!paymentsMap.has(p.order_id)) {
            paymentsMap.set(p.order_id, {
              date: p.payment_date,
              amount: p.amount,
              method: p.payment_method,
            });
          }
        });
      }

      // 5. Combine and compute metrics
      const now = new Date();
      const mapped: LayawayReviewOrder[] = rawOrders.map((o: RawOrderRow) => {
        const custInfo = o.customer_id ? customerMap.get(o.customer_id) : undefined;
        const custName = custInfo?.name || o.shipping_name || 'No Name';
        const custPhone = custInfo?.phone && custInfo.phone !== '-' ? custInfo.phone : o.shipping_phone || '-';

        const orderCreatedDate = o.created_at ? parseISO(o.created_at) : now;
        const orderAgeDays = differenceInDays(now, orderCreatedDate);

        const latestPay = paymentsMap.get(o.id);
        let daysSinceLastPayment: number | undefined = undefined;
        let activityStatus: 'dormant' | 'active_paying' | 'no_payment' = 'no_payment';

        if (latestPay?.date) {
          const payDate = parseISO(latestPay.date);
          daysSinceLastPayment = differenceInDays(now, payDate);
          activityStatus = daysSinceLastPayment >= 90 ? 'dormant' : 'active_paying';
        } else if ((o.amount_paid || 0) > 0) {
          daysSinceLastPayment = orderAgeDays;
          activityStatus = orderAgeDays >= 90 ? 'dormant' : 'active_paying';
        } else {
          activityStatus = 'no_payment';
        }

        return {
          id: o.id,
          orderDate: o.order_date || o.created_at,
          createdAt: o.created_at,
          customerId: o.customer_id || undefined,
          customerName: custName,
          customerPhone: custPhone,
          salesPersonName: o.sales_person_name || 'Unassigned',
          totalAmount: o.total_amount || 0,
          amountPaid: o.amount_paid || 0,
          balanceDue: o.balance_due || 0,
          status: o.status,
          notes: o.notes || '',
          trackingNumber: o.tracking_number || undefined,
          lastPaymentDate: latestPay?.date,
          lastPaymentAmount: latestPay?.amount,
          lastPaymentMethod: latestPay?.method,
          daysSinceLastPayment,
          orderAgeDays,
          activityStatus,
          items: itemsMap.get(o.id) || [],
        };
      });

      setOrders(mapped);
    } catch (err: unknown) {
      console.error('Error fetching layaways:', err);
      toast({
        variant: 'destructive',
        title: 'Error loading lay-aways',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    fetchLayaways();
  }, [fetchLayaways]);

  // Update entire raw order notes
  const updateOrderNotes = async (orderId: string, newNotes: string) => {
    if (!supabase) return false;
    setIsUpdating(orderId);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ notes: newNotes })
        .eq('id', orderId);

      if (error) throw error;

      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, notes: newNotes } : o))
      );

      toast({
        title: 'Notes Saved',
        description: `Order #${orderId.substring(0, 8)} notes updated.`,
      });
      return true;
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Failed to update notes',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
      return false;
    } finally {
      setIsUpdating(null);
    }
  };

  // Append a new note (connected to the order form)
  const appendOrderNote = async (
    orderId: string,
    newNoteText: string,
    authorName: string
  ) => {
    if (!supabase || !newNoteText.trim()) return false;
    setIsUpdating(orderId);
    try {
      const order = orders.find((o) => o.id === orderId);
      const existingNotes = order?.notes || '';
      const timestamp = format(new Date(), 'MMM d, yyyy h:mm a');
      const formattedEntry = `[${timestamp}] ${authorName}:\n${newNoteText.trim()}`;
      const updatedNotes = existingNotes ? `${existingNotes}\n\n${formattedEntry}` : formattedEntry;

      const { error } = await supabase
        .from('orders')
        .update({ notes: updatedNotes })
        .eq('id', orderId);

      if (error) throw error;

      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, notes: updatedNotes } : o))
      );

      toast({
        title: 'Note Added to Order Form',
        description: `New note saved for Order #${orderId.substring(0, 8)}.`,
      });
      return true;
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Failed to add note',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
      return false;
    } finally {
      setIsUpdating(null);
    }
  };

  // Update order status (e.g. Mark as Shipped, Completed, Cancelled)
  const updateOrderStatus = async (
    orderId: string,
    newStatus: string,
    customReason?: string
  ) => {
    if (!supabase) return false;
    setIsUpdating(orderId);
    try {
      const updatePayload: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'Shipped') {
        updatePayload.shipped_at = new Date().toISOString();
      } else if (newStatus === 'Completed') {
        updatePayload.completed_at = new Date().toISOString();
      }

      if (customReason) {
        const order = orders.find((o) => o.id === orderId);
        const existingNotes = order?.notes || '';
        const appendNote = `[Status changed to ${newStatus}: ${customReason}]`;
        updatePayload.notes = existingNotes ? `${existingNotes}\n${appendNote}` : appendNote;
      }

      const { error } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId);

      if (error) throw error;

      // Remove from open list
      setOrders((prev) => prev.filter((o) => o.id !== orderId));

      toast({
        title: 'Status Updated',
        description: `Order #${orderId.substring(0, 8)} changed to ${newStatus}.`,
      });
      return true;
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Failed to update status',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
      return false;
    } finally {
      setIsUpdating(null);
    }
  };

  return {
    orders,
    isLoading,
    isUpdating,
    refreshLayaways: fetchLayaways,
    updateOrderNotes,
    appendOrderNote,
    updateOrderStatus,
  };
}
