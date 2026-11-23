import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderChangeAction, OrderChangeNotice, OrderItemChange } from '@/types/order-changes';
import { ORDER_STATUSES_DONE, mergeOrderChanges } from './order-change-rules';
import { STATUSES_AFTER_PICKING } from '../order-issues-service';

// Server side (service role). Order changed after it was printed: see
// docs/BUSINESS_WORKFLOW.md, "Order changed after it was printed".

/**
 * Saves one notice when an edit changed the items of an order the warehouse may
 * already be working on (printed, or picked). Returns false when no notice is
 * needed (nothing changed, not printed yet, or already shipped / cancelled).
 */
export async function recordOrderChange(
  supabase: SupabaseClient,
  orderId: string,
  changes: OrderItemChange[],
  changedBy: string
): Promise<boolean> {
  if (changes.length === 0) return false;
  const { data: order, error } = await supabase
    .from('orders')
    .select('status, is_printed')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order || ORDER_STATUSES_DONE.includes(order.status)) return false;
  const picked = STATUSES_AFTER_PICKING.includes(order.status);
  if (!order.is_printed && !picked) return false;

  const { error: insErr } = await supabase.from('order_change_alerts').insert({
    order_id: orderId,
    changes,
    status_at_change: order.status,
    was_printed: !!order.is_printed,
    changed_by: changedBy,
  });
  if (insErr) throw insErr;
  return true;
}

/** Open notices, one per order (net change), newest change first. */
export async function listOpenOrderChanges(supabase: SupabaseClient): Promise<OrderChangeNotice[]> {
  const { data: rows, error } = await supabase
    .from('order_change_alerts')
    .select('id, order_id, changes, was_printed, changed_by, created_at')
    .is('handled_at', null)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const orderIds = Array.from(new Set(rows.map((r) => r.order_id)));
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, status, customer_id, customers(full_name)')
    .in('id', orderIds);
  if (oErr) throw oErr;
  const orderMap = new Map((orders || []).map((o: any) => [o.id, o]));

  // Shipped or cancelled since: nothing left for the warehouse to fix.
  const finished = orderIds.filter((id) => {
    const o = orderMap.get(id);
    return !o || ORDER_STATUSES_DONE.includes(o.status);
  });
  if (finished.length > 0) {
    await supabase
      .from('order_change_alerts')
      .update({ handled_at: new Date().toISOString(), handled_by: 'System', handled_how: 'closed' })
      .in('order_id', finished)
      .is('handled_at', null);
  }

  const byOrder = new Map<string, typeof rows>();
  for (const r of rows) {
    if (finished.includes(r.order_id)) continue;
    byOrder.set(r.order_id, [...(byOrder.get(r.order_id) || []), r]);
  }

  const notices: OrderChangeNotice[] = [];
  byOrder.forEach((list, orderId) => {
    const o: any = orderMap.get(orderId);
    const changes = mergeOrderChanges(list.map((r) => (Array.isArray(r.changes) ? r.changes : [])));
    if (changes.length === 0) return; // edited back to how it was printed
    const customer = Array.isArray(o.customers) ? o.customers[0] : o.customers;
    notices.push({
      orderId,
      orderCode: orderId.substring(0, 7).toUpperCase(),
      customerName: customer?.full_name || 'Customer',
      status: o.status,
      changes,
      changedBy: Array.from(new Set(list.map((r) => r.changed_by).filter(Boolean))) as string[],
      firstChangedAt: list[0].created_at,
      lastChangedAt: list[list.length - 1].created_at,
      editCount: list.length,
      wasPrinted: list.some((r) => r.was_printed),
      afterPicking: STATUSES_AFTER_PICKING.includes(o.status),
    });
  });
  return notices.sort((a, b) => b.lastChangedAt.localeCompare(a.lastChangedAt));
}

/** Reprinted or "Got it": closes every open notice of these orders. */
export async function handleOrderChanges(
  supabase: SupabaseClient,
  orderIds: string[],
  how: OrderChangeAction,
  byName: string
): Promise<number> {
  if (orderIds.length === 0) return 0;
  const { data, error } = await supabase
    .from('order_change_alerts')
    .update({ handled_at: new Date().toISOString(), handled_by: byName, handled_how: how })
    .in('order_id', orderIds)
    .is('handled_at', null)
    .select('id');
  if (error) throw error;
  return data?.length || 0;
}
