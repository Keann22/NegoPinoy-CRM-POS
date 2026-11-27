import type { SupabaseClient } from '@supabase/supabase-js';
import { shortOrderId } from '@/lib/shipping/ship-hold-rules';
import type { CopilotOpenOrderOption, CopilotWaitingPrompt } from '@/types';

const CLOSED_RECENT_STATUSES = ['Shipped', 'Delivered', 'Completed', 'Payment Received (COD)', 'Returned'];

export async function loadCustomerPhase2Context(
  supabase: SupabaseClient,
  customerId: string | null,
  openOrderIds: string[]
): Promise<{
  waitingPrompts: CopilotWaitingPrompt[];
  recentClosedOrders: CopilotOpenOrderOption[];
}> {
  if (!customerId) return { waitingPrompts: [], recentClosedOrders: [] };

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [closedRes, rtsRes, holdRes] = await Promise.all([
    supabase
      .from('orders')
      .select(
        'id, status, order_date, created_at, payment_method, total_amount, balance_due, is_printed, order_items(product_id, product_name, quantity, selling_price_at_sale, unit_price)'
      )
      .eq('customer_id', customerId)
      .in('status', CLOSED_RECENT_STATUSES)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('customer_returns')
      .select('id, order_id, case_no, orders!inner(customer_id)')
      .eq('status', 'open')
      .eq('source', 'rts')
      .is('decided_at', null)
      .eq('orders.customer_id', customerId)
      .limit(5),
    openOrderIds.length > 0
      ? supabase
          .from('order_ship_holds')
          .select('id, order_id, reason, check_on')
          .in('order_id', openOrderIds)
          .is('released_at', null)
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const recentClosedOrders: CopilotOpenOrderOption[] = (closedRes.data ?? []).map((o) => {
    const rawItems = (o.order_items ?? []) as Array<{
      product_id: string | null;
      product_name: string | null;
      quantity: number | null;
      selling_price_at_sale: number | null;
      unit_price: number | null;
    }>;
    const items = rawItems
      .filter((it) => Boolean(it.product_id))
      .map((it) => ({
        productId: String(it.product_id),
        productName: String(it.product_name || 'Item'),
        quantity: Number(it.quantity || 1),
        unitPrice: Number(it.selling_price_at_sale ?? it.unit_price ?? 0),
      }));
    return {
      id: String(o.id),
      shortId: shortOrderId(String(o.id)),
      status: String(o.status || 'Delivered'),
      orderDate: String(o.order_date || o.created_at).slice(0, 10),
      paymentMethod: String(o.payment_method || 'COD'),
      totalAmount: Number(o.total_amount || 0),
      balanceDue: Number(o.balance_due || 0),
      isPrinted: Boolean(o.is_printed),
      itemsSummary: items.map((i) => `${i.quantity}x ${i.productName}`).join(', ') || 'No items',
      items,
    };
  });

  const waitingPrompts: CopilotWaitingPrompt[] = [];

  for (const r of rtsRes.data ?? []) {
    const oid = String(r.order_id);
    waitingPrompts.push({
      promptType: 'rts',
      promptId: String(r.id),
      orderId: oid,
      shortOrderId: shortOrderId(oid),
      summary: `RTS Case #${r.case_no} — ask resend or cancel`,
      allowedChoices: ['resend', 'cancel', 'waiting'],
    });
  }

  for (const h of holdRes.data ?? []) {
    const oid = String(h.order_id);
    waitingPrompts.push({
      promptType: 'ship_hold',
      promptId: String(h.id),
      orderId: oid,
      shortOrderId: shortOrderId(oid),
      summary: `Ship Hold (${h.reason || 'hold'}, check ${h.check_on || 'TBD'})`,
      allowedChoices: ['release', 'not_yet', 'waiting'],
    });
  }

  if (openOrderIds.length > 0) {
    const { data: oiRows } = await supabase
      .from('order_items')
      .select('order_id, product_id, product_name')
      .in('order_id', openOrderIds);
    const pids = Array.from(new Set((oiRows ?? []).map((x) => x.product_id).filter(Boolean) as string[]));
    if (pids.length > 0) {
      const { data: flagRows } = await supabase
        .from('supplier_stock_flags')
        .select('id, product_id, status, note')
        .in('product_id', pids)
        .is('cleared_at', null);
      const flagsByPid = new Map((flagRows ?? []).map((f) => [String(f.product_id), f]));
      for (const oi of oiRows ?? []) {
        const flag = oi.product_id ? flagsByPid.get(String(oi.product_id)) : undefined;
        if (!flag) continue;
        const oid = String(oi.order_id);
        waitingPrompts.push({
          promptType: 'supplier_stock',
          promptId: String(flag.id),
          orderId: oid,
          shortOrderId: shortOrderId(oid),
          summary: `Supplier ${flag.status}: ${oi.product_name}${flag.note ? ` (${flag.note})` : ''}`,
          allowedChoices: ['wait', 'waiting_customer', 'editing'],
        });
      }
    }
  }

  return { waitingPrompts, recentClosedOrders };
}
