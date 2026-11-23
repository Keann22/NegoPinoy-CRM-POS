import type { SupabaseClient } from '@supabase/supabase-js';
import type { Order, OrderItem } from '@/hooks/useProcessedOrders';

/** Everything the printed order form needs, for any orders (reprints). */
export async function fetchOrdersForPrint(supabase: SupabaseClient, orderIds: string[]): Promise<Order[]> {
  if (orderIds.length === 0) return [];
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, customer_id, created_at, order_date, status, payment_method, total_amount, notes, sales_person_name, is_printed')
    .in('id', orderIds);
  if (error) throw error;

  const customerIds = Array.from(new Set((orders || []).map((o: any) => o.customer_id).filter(Boolean)));
  const [custRes, itemsRes] = await Promise.all([
    customerIds.length
      ? supabase.from('customers').select('id, full_name, address_line, mobile_number').in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('order_items')
      .select('id, order_id, quantity, selling_price_at_sale, product_id, products(name)')
      .in('order_id', orderIds),
  ]);
  if (custRes.error) throw custRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const customers = new Map((custRes.data || []).map((c: any) => [c.id, c]));
  const items = new Map<string, OrderItem[]>();
  for (const it of (itemsRes.data || []) as any[]) {
    const product = Array.isArray(it.products) ? it.products[0] : it.products;
    items.set(it.order_id, [
      ...(items.get(it.order_id) || []),
      {
        id: it.id,
        orderId: it.order_id,
        productId: it.product_id,
        productName: product?.name || 'Unknown Product',
        quantity: it.quantity,
        sellingPriceAtSale: it.selling_price_at_sale,
      },
    ]);
  }

  const byId = new Map((orders || []).map((o: any) => [o.id, o]));
  return orderIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((o: any) => {
      const c: any = customers.get(o.customer_id);
      return {
        id: o.id,
        customerId: o.customer_id,
        orderDate: o.order_date || o.created_at,
        orderStatus: o.status,
        paymentType: o.payment_method,
        totalAmount: Number(o.total_amount),
        shippingDetails: o.notes,
        salesPersonName: o.sales_person_name || undefined,
        isPrinted: !!o.is_printed,
        customerName: c?.full_name || 'Unknown Customer',
        customerAddress: c?.address_line || '',
        customerMobile: c?.mobile_number || '',
        items: items.get(o.id) || [],
      };
    });
}

/** Finds orders to reprint by order # (first characters) or customer name. */
export async function searchOrdersToReprint(
  supabase: SupabaseClient,
  term: string
): Promise<{ id: string; code: string; customerName: string; status: string; orderDate: string }[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const hex = q.replace(/^#/, '').toLowerCase();
  const select = 'id, status, order_date, created_at, customers!inner(full_name)';
  let rows: any[] = [];
  if (/^[0-9a-f]{3,8}$/.test(hex)) {
    // uuid range for the prefix (PostgREST can't filter id::text).
    const lo = `${hex.padEnd(8, '0')}-0000-0000-0000-000000000000`;
    const hi = `${hex.padEnd(8, 'f')}-ffff-ffff-ffff-ffffffffffff`;
    const { data } = await supabase.from('orders').select(select).gte('id', lo).lte('id', hi)
      .order('created_at', { ascending: false }).limit(10);
    rows = data || [];
  }
  if (rows.length === 0) {
    const { data } = await supabase.from('orders').select(select).ilike('customers.full_name', `%${q}%`)
      .order('created_at', { ascending: false }).limit(10);
    rows = data || [];
  }
  return rows.map((o) => {
    const c = Array.isArray(o.customers) ? o.customers[0] : o.customers;
    return {
      id: o.id,
      code: o.id.substring(0, 7).toUpperCase(),
      customerName: c?.full_name || 'Customer',
      status: o.status,
      orderDate: o.order_date || o.created_at,
    };
  });
}
