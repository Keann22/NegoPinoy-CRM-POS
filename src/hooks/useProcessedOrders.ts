import { useState, useMemo, useEffect } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { DateRange } from 'react-day-picker';
import { startOfMonth, endOfMonth } from 'date-fns';

export type OrderItem = {
    id: string;
    orderId: string;
    productName: string;
    quantity: number;
    sellingPriceAtSale?: number;
}

export type Order = {
  id: string;
  customerId: string;
  orderDate: string;
  totalAmount: number;
  orderStatus: string;
  paymentType: string;
  shippingDetails?: string;
  customerName?: string;
  customerAddress?: string;
  customerMobile?: string;
  salesPersonName?: string;
  isPrinted?: boolean;
  items?: OrderItem[];
};

export function useProcessedOrders() {
  const [date, setDate] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [activeTab, setActiveTab] = useState<'to-print' | 'printed'>('to-print');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const supabase = useSupabase();
  const { user } = useUser();

  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [enrichedOrders, setEnrichedOrders] = useState<Order[]>([]);

  // Clear selection when tab changes
  useEffect(() => {
    setSelectedOrderIds(new Set());
  }, [activeTab]);

  // Step 1: Load orders for the selected date range and print status.
  // Filters are pushed to the DB (not applied client-side on a truncated set)
  // and the response is paginated so the PostgREST 1000-row cap can never
  // silently hide older orders.
  useEffect(() => {
    if (!supabase || !user || !date?.from || !date?.to) return;
    const fetchOrders = async () => {
      setIsLoadingOrders(true);
      try {
        const fromIso = new Date(date.from!).toISOString();
        const toDate = new Date(date.to!);
        toDate.setHours(23, 59, 59, 999);
        const toIso = toDate.toISOString();

        const PAGE_SIZE = 1000;
        let all: any[] = [];
        let page = 0;
        while (true) {
          const { data, error } = await supabase
            .from('orders')
            .select('id, customer_id, created_at, status, payment_method, total_amount, notes, sales_person_name, is_printed')
            .gte('created_at', fromIso)
            .lte('created_at', toIso)
            .eq('is_printed', activeTab === 'printed')
            .order('created_at', { ascending: false })
            .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

          if (error) throw error;
          all = all.concat(data || []);
          if (!data || data.length < PAGE_SIZE) break;
          page++;
        }

        const mapped = all.map((o: any) => ({
          id: o.id,
          customerId: o.customer_id,
          orderDate: o.created_at,
          orderStatus: o.status,
          paymentType: o.payment_method,
          totalAmount: Number(o.total_amount),
          shippingDetails: o.notes,
          salesPersonName: o.sales_person_name || null,
          isPrinted: o.is_printed || false,
        }));
        setAllOrders(mapped);
      } catch (err) {
        console.error('Error fetching orders:', err);
      } finally {
        setIsLoadingOrders(false);
      }
    };
    fetchOrders();
  }, [supabase, user, date, activeTab]);

  // Step 2: Filter orders by date range and status
  const filteredOrders = useMemo(() => {
    if (!allOrders || !date?.from || !date?.to) return [];
    const fromTime = date.from.getTime();
    const toDate = new Date(date.to);
    toDate.setHours(23, 59, 59, 999);
    const toTime = toDate.getTime();

    return allOrders.filter(order => {
      const orderTime = new Date(order.orderDate).getTime();
      const withinDate = orderTime >= fromTime && orderTime <= toTime;
      const validStatus = order.orderStatus !== 'Cancelled' && order.orderStatus !== 'Returned';
      const matchesTab = activeTab === 'to-print' ? !order.isPrinted : !!order.isPrinted;
      
      return withinDate && validStatus && matchesTab;
    });
  }, [allOrders, date, activeTab]);

  // Step 3: Enrich filtered orders with customer names and order items
  useEffect(() => {
    if (!supabase || filteredOrders.length === 0) {
      setEnrichedOrders(filteredOrders.map(o => ({ ...o, customerName: 'Unknown Customer', items: [] })));
      return;
    }

    const enrich = async () => {
      setIsLoadingDetails(true);
      try {
        const orderIds = filteredOrders.map(o => o.id);
        const customerIds = Array.from(new Set(filteredOrders.map(o => o.customerId).filter(Boolean)));

        // Fetch customers for these orders only (Chunked)
        const chunkSize = 150;
        let customersData: any[] = [];
        for (let i = 0; i < customerIds.length; i += chunkSize) {
            const chunk = customerIds.slice(i, i + chunkSize);
            const { data } = await supabase
              .from('customers')
              .select('id, full_name, address_line, mobile_number')
              .in('id', chunk);
            if (data) customersData = customersData.concat(data);
        }

        const customerMap = new Map<string, any>();
        customersData.forEach((c: any) => {
          customerMap.set(c.id, {
              name: c.full_name || 'Unknown Customer',
              address: c.address_line || '',
              mobile: c.mobile_number || ''
          });
        });

        // Fetch order items for these orders only (Chunked)
        let itemsData: any[] = [];
        for (let i = 0; i < orderIds.length; i += chunkSize) {
            const chunk = orderIds.slice(i, i + chunkSize);
            const { data } = await supabase
              .from('order_items')
              .select('id, order_id, quantity, selling_price_at_sale, product_id, products(name)')
              .in('order_id', chunk);
            if (data) itemsData = itemsData.concat(data);
        }

        // Group items by order_id
        const itemsMap = new Map<string, OrderItem[]>();
        (itemsData || []).forEach((item: any) => {
          const existing = itemsMap.get(item.order_id) || [];
          existing.push({
            id: item.id,
            orderId: item.order_id,
            productName: item.products?.name || 'Unknown Product',
            quantity: item.quantity,
            sellingPriceAtSale: item.selling_price_at_sale,
          });
          itemsMap.set(item.order_id, existing);
        });

        const enriched = filteredOrders.map(order => {
          const cust = customerMap.get(order.customerId) || { name: 'Unknown Customer', address: '', mobile: '' };
          return {
            ...order,
            customerName: cust.name,
            customerAddress: cust.address,
            customerMobile: cust.mobile,
            items: itemsMap.get(order.id) || [],
          };
        });

        // Sort: 1. Unshipped first, 2. Alphabetical by Customer Name
        enriched.sort((a, b) => {
            const aPending = ['Pending Payment', 'Processing'].includes(a.orderStatus) ? 0 : 1;
            const bPending = ['Pending Payment', 'Processing'].includes(b.orderStatus) ? 0 : 1;
            
            if (aPending !== bPending) return aPending - bPending;
            
            return (a.customerName || '').localeCompare(b.customerName || '');
        });

        setEnrichedOrders(enriched);
      } catch (err) {
        console.error('Error enriching orders:', err);
      } finally {
        setIsLoadingDetails(false);
      }
    };

    enrich();
  }, [filteredOrders, supabase]);

  const isLoading = isLoadingOrders || isLoadingDetails;
  
  const orders = useMemo(() => {
    if (!searchTerm) return enrichedOrders;
    const lower = searchTerm.toLowerCase();
    return enrichedOrders.filter(o => 
        o.customerName?.toLowerCase().includes(lower) || 
        o.id.toLowerCase().includes(lower)
    );
  }, [enrichedOrders, searchTerm]);

  const handleMarkBatchPrinted = async () => {
    if (!supabase || orders.length === 0) return;
    try {
        const orderIds = selectedOrderIds.size > 0 ? Array.from(selectedOrderIds) : orders.map(o => o.id);
        await supabase.from('orders').update({ is_printed: true }).in('id', orderIds);
        setAllOrders(prev => prev.map(o => orderIds.includes(o.id) ? { ...o, isPrinted: true } : o));
        setSelectedOrderIds(new Set());
    } catch (err) {
        console.error('Error marking batch as printed:', err);
    }
  };

  const togglePrintStatus = async (orderId: string, currentStatus: boolean) => {
    if (!supabase) return;
    try {
        await supabase.from('orders').update({ is_printed: !currentStatus }).eq('id', orderId);
        setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, isPrinted: !currentStatus } : o));
    } catch (err) {
        console.error('Error toggling print status:', err);
    }
  };

  const toggleSelectAll = () => {
      if (selectedOrderIds.size === orders.length) {
          setSelectedOrderIds(new Set());
      } else {
          setSelectedOrderIds(new Set(orders.map(o => o.id)));
      }
  };

  const toggleSelect = (id: string) => {
      const next = new Set(selectedOrderIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedOrderIds(next);
  };

  return {
    date,
    setDate,
    activeTab,
    setActiveTab,
    selectedOrderIds,
    searchTerm,
    setSearchTerm,
    orders,
    isLoading,
    handleMarkBatchPrinted,
    togglePrintStatus,
    toggleSelectAll,
    toggleSelect
  };
}
