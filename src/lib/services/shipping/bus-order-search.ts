import type { SupabaseClient } from '@supabase/supabase-js';
import { BUS_SHIPPABLE_STATUSES, type BusCandidateOrder, type BusPlan } from '@/types/bus-shipping.types';
import { round2 } from './bus-fee-rules';

/**
 * Finding the orders that go on one bus trip: staff type an order # or the
 * customer's name, and get that customer's orders that can ship (picked or later,
 * not yet on a recorded trip).
 */

export const BUS_ORDER_COLUMNS =
  'id, status, order_date, created_at, customer_id, sales_person_name, subtotal, total_discount, total_amount, amount_paid, ' +
  'balance_due, shipping_fee, package_weight, boxes_config, tracking_number, customers(full_name), order_items(product_name, quantity)';

/** Orders still being worked on, shown so staff see them, but not tickable. */
const OPEN_NOT_READY = ['Processing', 'Pending', 'Picked (with issue)', 'On-Hold'];

export interface BusOrderRow {
  id: string;
  status: string;
  order_date: string | null;
  created_at: string | null;
  customer_id: string | null;
  sales_person_name: string | null;
  subtotal: number | string | null;
  total_discount: number | string | null;
  total_amount: number | string | null;
  amount_paid: number | string | null;
  balance_due: number | string | null;
  shipping_fee: number | string | null;
  package_weight: number | string | null;
  boxes_config: unknown;
  tracking_number: string | null;
  customers: { full_name: string | null } | null;
  order_items: { product_name: string | null; quantity: number }[] | null;
}

export const shortOrder = (id: string) => id.slice(0, 7).toUpperCase();
const num = (v: unknown) => Number(v || 0);

function boxesInfo(config: unknown, packageWeight: unknown): { weightKg: number | null; boxCount: number | null } {
  if (Array.isArray(config) && config.length > 0) {
    const kg = config.reduce((s: number, b: { weight?: unknown } | null) => s + (Number(b?.weight) || 0), 0);
    return { weightKg: kg > 0 ? round2(kg) : num(packageWeight) || null, boxCount: config.length };
  }
  return { weightKg: num(packageWeight) || null, boxCount: null };
}

export function toCandidate(o: BusOrderRow, busShipmentId: string | null, busPlan: BusPlan | null = null): BusCandidateOrder {
  const total = num(o.total_amount);
  const paid = num(o.amount_paid);
  const canShip = !busShipmentId && BUS_SHIPPABLE_STATUSES.includes(o.status);
  return {
    id: o.id,
    shortId: shortOrder(o.id),
    status: o.status,
    orderDate: o.order_date || o.created_at,
    customerId: o.customer_id,
    customerName: o.customers?.full_name || 'Customer',
    salesPersonName: o.sales_person_name,
    items: (o.order_items || []).map((i) => `${i.quantity}× ${i.product_name}`).join(', '),
    itemValue: round2(num(o.subtotal) - num(o.total_discount)),
    totalAmount: total,
    amountPaid: paid,
    balanceDue: Math.max(0, num(o.balance_due)),
    shippingFee: num(o.shipping_fee),
    advance: round2(Math.max(0, paid - total)),
    ...boxesInfo(o.boxes_config, o.package_weight),
    busShipmentId,
    busPlan,
    canShip,
    blockedReason: busShipmentId
      ? 'Bus fee already recorded'
      : canShip ? null : o.status === 'Picked (with issue)' ? 'Missing items (picked with issue)' : `Still ${o.status}`,
  };
}

async function tripsOf(supabase: SupabaseClient, orderIds: string[]): Promise<Map<string, string>> {
  if (orderIds.length === 0) return new Map();
  const { data, error } = await supabase.from('bus_shipment_orders').select('order_id, shipment_id').in('order_id', orderIds);
  if (error) throw error;
  return new Map(((data || []) as { order_id: string; shipment_id: string }[]).map((r) => [r.order_id, r.shipment_id]));
}

interface PlanRow {
  order_id: string;
  bus_company: string;
  destination: string;
  note: string | null;
  requested_by_name: string | null;
  requested_at: string;
}

export const toBusPlan = (r: PlanRow): BusPlan => ({
  busCompany: r.bus_company, destination: r.destination, note: r.note,
  requestedBy: r.requested_by_name, requestedAt: r.requested_at,
});

async function plansOf(supabase: SupabaseClient, orderIds: string[]): Promise<Map<string, BusPlan>> {
  if (orderIds.length === 0) return new Map();
  const { data, error } = await supabase.from('bus_ship_requests').select('*').in('order_id', orderIds);
  if (error) throw error;
  return new Map(((data || []) as PlanRow[]).map((r) => [r.order_id, toBusPlan(r)]));
}

/** Orders with their bus trip (if recorded) and bus plan (if marked). */
export async function toCandidates(supabase: SupabaseClient, rows: BusOrderRow[]): Promise<BusCandidateOrder[]> {
  const ids = rows.map((r) => r.id);
  const [trips, plans] = await Promise.all([tripsOf(supabase, ids), plansOf(supabase, ids)]);
  return rows.map((r) => toCandidate(r, trips.get(r.id) ?? null, plans.get(r.id) ?? null));
}

/** Every order of these customers that can ship or is still being worked on (newest first). */
async function customersOrders(supabase: SupabaseClient, customerIds: string[]): Promise<BusCandidateOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(BUS_ORDER_COLUMNS)
    .in('customer_id', customerIds)
    .in('status', [...BUS_SHIPPABLE_STATUSES, ...OPEN_NOT_READY])
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw error;
  const rows = (data || []) as unknown as BusOrderRow[];
  // "Shipped" orders only matter if their bus fee wasn't recorded yet, and only recent ones.
  const monthAgo = Date.now() - 30 * 86_400_000;
  return (await toCandidates(supabase, rows))
    .filter((c) => c.status !== 'Shipped' || (!c.busShipmentId && new Date(c.orderDate || 0).getTime() > monthAgo));
}

/** Search by order # (first 4-8 characters) or customer name. */
export async function searchBusOrders(supabase: SupabaseClient, query: string): Promise<BusCandidateOrder[]> {
  const q = query.trim().replace(/^#/, '');
  if (q.length < 3) return [];
  let customerIds: string[] = [];
  if (/^[0-9a-f]{4,8}$/i.test(q)) {
    // Order # prefix: a uuid range (no ::text casts in PostgREST).
    const p = q.toLowerCase();
    const { data } = await supabase.from('orders').select('customer_id')
      .gte('id', `${p.padEnd(8, '0')}-0000-0000-0000-000000000000`)
      .lte('id', `${p.padEnd(8, 'f')}-ffff-ffff-ffff-ffffffffffff`)
      .limit(5);
    customerIds = ((data || []) as { customer_id: string | null }[]).map((o) => o.customer_id).filter((id): id is string => !!id);
  }
  if (customerIds.length === 0) {
    const { data } = await supabase.from('customers').select('id').ilike('full_name', `%${q}%`).limit(15);
    customerIds = ((data || []) as { id: string }[]).map((c) => c.id);
  }
  if (customerIds.length === 0) return [];
  return customersOrders(supabase, Array.from(new Set(customerIds)));
}

/** The customer of this order, with their other orders (for "Ship by bus" from an order). */
export async function busOrdersForOrder(supabase: SupabaseClient, orderId: string): Promise<BusCandidateOrder[]> {
  const { data, error } = await supabase.from('orders').select('customer_id').eq('id', orderId).single();
  if (error || !data) return [];
  if (data.customer_id) return customersOrders(supabase, [data.customer_id]);
  const { data: one } = await supabase.from('orders').select(BUS_ORDER_COLUMNS).eq('id', orderId).single();
  if (!one) return [];
  return toCandidates(supabase, [one as unknown as BusOrderRow]);
}
