import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Which items on the Procurement Sheet are holding up a customer who is in a
 * hurry ("nagmamadali") or has already paid in full, so the buyer knows what
 * really has to be bought first. An item counts for an order when the order
 * has an open OS issue for it or a buy request linked to it.
 */

export interface PriorityOrderRef {
  orderId: string;
  shortOrderId: string;
  customerName: string;
  note?: string | null;
}

export interface ItemPriority {
  urgent: PriorityOrderRef[];
  paid: PriorityOrderRef[];
}

const OPEN_STATUSES = [
  'Pending Payment', 'Processing', 'Picked', 'Picked (with issue)', 'Photo',
  'Packed', 'For Shipping', 'On-Hold', 'Waiting for Stock',
];
const CHUNK = 150;

async function inChunks<T>(ids: string[], run: (c: string[]) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await run(ids.slice(i, i + CHUNK));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

/**
 * @param linkedOrders product id -> order ids from its buy request (sourceOrders)
 */
export async function getItemPriorities(
  supabase: SupabaseClient,
  productIds: string[],
  linkedOrders: Map<string, string[]>
): Promise<Map<string, ItemPriority>> {
  const result = new Map<string, ItemPriority>();
  if (productIds.length === 0) return result;

  // Orders waiting on each product: open OS issues + buy-request links.
  const issues = await inChunks<any>(productIds, (c) =>
    supabase.from('order_issues').select('order_id, product_id').eq('status', 'open').eq('issue_type', 'order').in('product_id', c).limit(5000));
  const ordersByProduct = new Map<string, Set<string>>();
  const add = (pid: string, oid: string) => {
    if (!ordersByProduct.has(pid)) ordersByProduct.set(pid, new Set());
    ordersByProduct.get(pid)!.add(oid);
  };
  issues.forEach((i) => add(i.product_id, i.order_id));
  linkedOrders.forEach((oids, pid) => oids.forEach((oid) => add(pid, oid)));

  const orderIds = Array.from(new Set(Array.from(ordersByProduct.values()).flatMap((s) => Array.from(s))));
  if (orderIds.length === 0) return result;

  const [orders, events] = await Promise.all([
    inChunks<any>(orderIds, (c) => supabase.from('orders')
      .select('id, status, payment_method, balance_due, customers(full_name)').in('id', c).in('status', OPEN_STATUSES)),
    inChunks<any>(orderIds, (c) => supabase.from('order_priority_events')
      .select('order_id, kind, note, created_at').in('kind', ['urgent', 'urgent_cleared']).in('order_id', c)),
  ]).catch((error) => {
    // Before the urgent migration the events query can fail; paid marks still work.
    console.error('procurement priority lookup:', error?.message);
    return [[], []] as [any[], any[]];
  });

  const latestUrgent = new Map<string, any>();
  events.forEach((e) => {
    const prev = latestUrgent.get(e.order_id);
    if (!prev || e.created_at > prev.created_at) latestUrgent.set(e.order_id, e);
  });
  const orderById = new Map(orders.map((o) => [o.id, o]));

  ordersByProduct.forEach((oids, pid) => {
    const p: ItemPriority = { urgent: [], paid: [] };
    oids.forEach((oid) => {
      const o = orderById.get(oid);
      if (!o) return; // shipped / cancelled
      const ref: PriorityOrderRef = { orderId: o.id, shortOrderId: o.id.slice(0, 7).toUpperCase(), customerName: o.customers?.full_name || 'Customer' };
      const u = latestUrgent.get(oid);
      if (u?.kind === 'urgent') p.urgent.push({ ...ref, note: u.note });
      else if (o.payment_method !== 'COD' && Number(o.balance_due || 0) < 1) p.paid.push(ref);
    });
    if (p.urgent.length || p.paid.length) result.set(pid, p);
  });
  return result;
}

/** Nagmamadali items first, then items for fully paid orders, then the rest (stable). */
export function priorityRank(p: ItemPriority | null | undefined): number {
  if (p?.urgent.length) return 0;
  if (p?.paid.length) return 1;
  return 2;
}
