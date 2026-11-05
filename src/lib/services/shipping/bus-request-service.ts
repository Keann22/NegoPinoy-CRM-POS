import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BUS_PLAN_CLOSED_STATUSES, type BusQueueGroup, type BusSuggestion, type MarkForBusInput,
} from '@/types/bus-shipping.types';
import { BusShipmentError } from './bus-shipment-service';
import { BUS_ORDER_COLUMNS, shortOrder, toCandidates, type BusOrderRow } from './bus-order-search';

/**
 * "Ship by bus" before it goes (owner, 2026-11-05): sales marks a customer's
 * orders and picks the bus company and station. They wait on Bus Shipping →
 * "Waiting for bus" until staff record the fee at the terminal.
 *
 * Marking also puts "BUS SHIPPING: …" as the order's not-for-shipping reason (if
 * it has none), so once packed it waits in Packed Orders → Waiting to be Shipped
 * instead of being verified for SPX by mistake.
 */

const REASON_PREFIX = 'BUS SHIPPING:';
const busReason = (company: string, destination: string) => `${REASON_PREFIX} ${company} — ${destination}`;
const closedList = `(${BUS_PLAN_CLOSED_STATUSES.map((s) => `"${s}"`).join(',')})`;

export async function markForBus(supabase: SupabaseClient, input: MarkForBusInput, actorName: string): Promise<number> {
  const busCompany = String(input.busCompany || '').trim();
  const destination = String(input.destination || '').trim();
  const note = String(input.note || '').trim() || null;
  const orderIds = Array.from(new Set((input.orderIds || []).map(String)));
  if (orderIds.length === 0) throw new BusShipmentError('Tick the orders that go by bus.');
  if (!busCompany) throw new BusShipmentError('Pick the bus company.');
  if (!destination) throw new BusShipmentError('Enter the bus station / terminal.');

  const { data, error } = await supabase
    .from('orders').select('id, status, customer_id, not_for_shipping_reason').in('id', orderIds);
  if (error) throw error;
  const rows = (data || []) as { id: string; status: string; customer_id: string | null; not_for_shipping_reason: string | null }[];
  if (rows.length !== orderIds.length) throw new BusShipmentError('One of the orders was not found. Reload and try again.', 404);
  if (new Set(rows.map((r) => r.customer_id)).size > 1) throw new BusShipmentError('Mark one customer at a time.');
  for (const r of rows) {
    if (BUS_PLAN_CLOSED_STATUSES.includes(r.status)) throw new BusShipmentError(`#${shortOrder(r.id)} is already ${r.status}.`);
  }
  const { data: onTrip } = await supabase.from('bus_shipment_orders').select('order_id').in('order_id', orderIds);
  if (onTrip && onTrip.length > 0) throw new BusShipmentError(`#${shortOrder(onTrip[0].order_id)} already went by bus.`);

  const now = new Date().toISOString();
  const { error: upsertError } = await supabase.from('bus_ship_requests').upsert(rows.map((r) => ({
    order_id: r.id, customer_id: r.customer_id, bus_company: busCompany, destination, note,
    requested_by_name: actorName, requested_at: now,
  })));
  if (upsertError) throw upsertError;

  for (const r of rows) {
    // Keep a reason someone typed (e.g. "waiting for her other items"); replace only ours.
    if (!r.not_for_shipping_reason || r.not_for_shipping_reason.startsWith(REASON_PREFIX)) {
      await supabase.from('orders').update({ not_for_shipping_reason: busReason(busCompany, destination) }).eq('id', r.id);
    }
    await supabase.from('order_logs').insert({
      order_id: r.id, status: 'Marked for bus shipping', user_name: actorName,
      snapshot_data: { bus_company: busCompany, destination, note },
    });
  }
  return rows.length;
}

export async function unmarkForBus(supabase: SupabaseClient, orderId: string, actorName: string): Promise<void> {
  const { error } = await supabase.from('bus_ship_requests').delete().eq('order_id', orderId);
  if (error) throw error;
  const { data: o } = await supabase.from('orders').select('not_for_shipping_reason').eq('id', orderId).single();
  if (o?.not_for_shipping_reason?.startsWith(REASON_PREFIX)) {
    await supabase.from('orders').update({ not_for_shipping_reason: null }).eq('id', orderId);
  }
  await supabase.from('order_logs').insert({ order_id: orderId, status: 'Bus shipping removed', user_name: actorName });
}

/** Drops marks that no longer apply. (After a recorded trip, bus-shipment-service clears them.) */
async function clearBusRequests(supabase: SupabaseClient, orderIds: string[]): Promise<void> {
  if (orderIds.length > 0) await supabase.from('bus_ship_requests').delete().in('order_id', orderIds);
}

/** Marked orders, one group per customer + bus + station; ready-to-go groups first. */
export async function listBusQueue(supabase: SupabaseClient): Promise<BusQueueGroup[]> {
  const { data: reqs, error } = await supabase.from('bus_ship_requests').select('order_id').limit(500);
  if (error) throw error;
  const ids = (reqs || []).map((r: { order_id: string }) => r.order_id);
  if (ids.length === 0) return [];
  const { data, error: ordersError } = await supabase.from('orders').select(BUS_ORDER_COLUMNS).in('id', ids);
  if (ordersError) throw ordersError;
  const candidates = await toCandidates(supabase, (data || []) as unknown as BusOrderRow[]);

  // Cancelled / completed some other way, or already on a recorded trip: drop the mark.
  const stale = candidates
    .filter((c) => c.busShipmentId || (c.status !== 'Shipped' && BUS_PLAN_CLOSED_STATUSES.includes(c.status)))
    .map((c) => c.id);
  await clearBusRequests(supabase, stale);

  const groups = new Map<string, BusQueueGroup>();
  for (const c of candidates) {
    if (stale.includes(c.id) || !c.busPlan) continue;
    const p = c.busPlan;
    const key = [c.customerId || c.id, p.busCompany.toLowerCase(), p.destination.toLowerCase()].join('|');
    const g = groups.get(key) || {
      key, customerId: c.customerId, customerName: c.customerName,
      busCompany: p.busCompany, destination: p.destination, note: p.note,
      requestedBy: p.requestedBy, requestedAt: p.requestedAt, orders: [],
    };
    g.orders.push(c);
    if (p.requestedAt < g.requestedAt) g.requestedAt = p.requestedAt;
    groups.set(key, g);
  }
  const ready = (g: BusQueueGroup) => g.orders.every((o) => o.canShip);
  return [...groups.values()].sort((a, b) => Number(ready(b)) - Number(ready(a)) || a.requestedAt.localeCompare(b.requestedAt));
}

const BUS_WORDS = ['bus', 'victory', 'five star', 'fivestar', 'partas', 'florida', 'genesis', 'solid north', 'dalin', 'baliwag', 'philtranco', 'joybus'];
const BUS_RE = /\b(bus|victory|five ?star|partas|florida|genesis|solid north|dalin|baliwag|philtranco|joybus)\b/i;

/** Open orders whose notes say bus but that nobody marked yet (to mark in one tap). */
export async function listBusSuggestions(supabase: SupabaseClient): Promise<BusSuggestion[]> {
  const cols = ['notes', 'tracking_number', 'not_for_shipping_reason'];
  const or = cols.flatMap((c) => BUS_WORDS.map((w) => `${c}.ilike.%${w}%`)).join(',');
  const { data, error } = await supabase
    .from('orders').select(`${BUS_ORDER_COLUMNS}, notes, not_for_shipping_reason`)
    .not('status', 'in', closedList).or(or)
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  const rows = (data || []) as unknown as (BusOrderRow & { notes: string | null; not_for_shipping_reason: string | null })[];
  const candidates = await toCandidates(supabase, rows);
  const out: BusSuggestion[] = [];
  rows.forEach((r, i) => {
    const c = candidates[i];
    if (c.busPlan || c.busShipmentId) return;
    const lines = [r.not_for_shipping_reason, r.tracking_number, ...(r.notes || '').split(/\r?\n/)].filter(Boolean) as string[];
    const hit = lines.find((l) => BUS_RE.test(l));
    if (hit) out.push({ order: c, hint: hit.trim().slice(0, 120) });
  });
  return out;
}
