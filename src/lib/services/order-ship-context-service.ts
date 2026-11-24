import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from './procurement-demand-service';
import { OPEN_ORDER_STATUSES, shortOrderId } from '@/lib/shipping/ship-hold-rules';
import { getHoldDetails } from './shipping/ship-hold-service';
import type { ShipHoldDetail } from '@/types/ship-holds.types';

export { OPEN_ORDER_STATUSES, shortOrderId };

/*
 * Can this order ship yet? (owner, 2026-11-24)
 *
 * Found 2026-11-24: #020106B was paid and packed, so the Priority List showed it
 * as ready to send and the owner assigned "Pwede na ipadala". But sales had held
 * it ("waiting sa ibang items nya, sabay sabay ipapadala bus shipping") and the
 * customer's other orders still owed ₱3,352.90. The hold note lived only on
 * Packed Orders, so nobody else saw it.
 *
 * This gathers, per order: the not-for-shipping note (who set it, when) and the
 * same customer's other open orders with their status and balance. Server only.
 */


const BUS_PREFIX = 'BUS SHIPPING';
const ORDER_COLS = 'id, status, customer_id, payment_method, balance_due, not_for_shipping_reason, order_date, created_at';

interface OrderRow {
  id: string;
  status: string;
  customer_id: string | null;
  payment_method: string | null;
  balance_due: number | string | null;
  not_for_shipping_reason: string | null;
  order_date: string | null;
  created_at: string;
}
interface HoldLog { order_id: string; user_name: string | null; created_at: string }
const CHUNK = 150;

export interface ShipHold {
  reason: string;
  /** Marked for bus on Bus Shipping (the reason is "BUS SHIPPING: …"). */
  bus: boolean;
  byName: string | null;
  at: string | null;
  /** Reason type, check-again date and ship-together group (phase 2); null for old free-text holds. */
  detail: ShipHoldDetail | null;
}

export interface SiblingOrder {
  id: string;
  shortId: string;
  status: string;
  paymentMethod: string | null;
  balanceDue: number;
  holdReason: string | null;
}

export interface OrderShipContext {
  status: string;
  paymentMethod: string | null;
  balanceDue: number;
  hold: ShipHold | null;
  /** The same customer's other open orders, oldest first. */
  others: SiblingOrder[];
}


async function inChunks<T>(ids: string[], fetchChunk: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await fetchChunk(ids.slice(i, i + CHUNK))));
  return out;
}

function holdOf(reason: string | null, log: HoldLog | undefined): ShipHold | null {
  const text = (reason || '').trim();
  if (!text) return null;
  return { reason: text, bus: text.toUpperCase().startsWith(BUS_PREFIX), byName: log?.user_name || null, at: log?.created_at || null, detail: null };
}

function withDetail(hold: ShipHold | null, detail: ShipHoldDetail | null): ShipHold | null {
  return hold ? { ...hold, detail } : null;
}

export async function getShipContexts(supabase: SupabaseClient, orderIds: string[]): Promise<Map<string, OrderShipContext>> {
  const ids = Array.from(new Set(orderIds.filter(Boolean)));
  const out = new Map<string, OrderShipContext>();
  if (ids.length === 0) return out;

  const orders = await inChunks(ids, (c) => fetchAllPages<OrderRow>((f, t) =>
    supabase.from('orders').select(ORDER_COLS).in('id', c).order('id').range(f, t)));
  const customerIds = Array.from(new Set(orders.map((o) => o.customer_id).filter((v): v is string => !!v)));

  const heldIds = orders.filter((o) => o.not_for_shipping_reason).map((o) => o.id);
  const [siblings, logs, details] = await Promise.all([
    inChunks(customerIds, (c) => fetchAllPages<OrderRow>((f, t) =>
      supabase.from('orders').select(ORDER_COLS)
        .in('customer_id', c).in('status', OPEN_ORDER_STATUSES).order('id').range(f, t))),
    // Who held it: the latest "Marked Not Ready to Ship" log (Packed Orders → Delay).
    inChunks(heldIds, (c) => fetchAllPages<HoldLog>((f, t) =>
      supabase.from('order_logs').select('order_id, user_name, created_at')
        .eq('status', 'Marked Not Ready to Ship').in('order_id', c).order('id').range(f, t))),
    getHoldDetails(supabase, heldIds),
  ]);

  const latestLog = new Map<string, HoldLog>();
  logs.forEach((l) => {
    const prev = latestLog.get(l.order_id);
    if (!prev || l.created_at > prev.created_at) latestLog.set(l.order_id, l);
  });

  const byCustomer = new Map<string, OrderRow[]>();
  siblings.forEach((s) => { if (s.customer_id) byCustomer.set(s.customer_id, [...(byCustomer.get(s.customer_id) || []), s]); });

  for (const o of orders) {
    const others = (o.customer_id ? byCustomer.get(o.customer_id) || [] : [])
      .filter((s) => s.id !== o.id)
      .sort((a, b) => String(a.order_date || a.created_at).localeCompare(String(b.order_date || b.created_at)))
      .map((s): SiblingOrder => ({
        id: s.id,
        shortId: shortOrderId(s.id),
        status: s.status,
        paymentMethod: s.payment_method,
        balanceDue: Number(s.balance_due || 0),
        holdReason: s.not_for_shipping_reason || null,
      }));
    out.set(o.id, {
      status: o.status,
      paymentMethod: o.payment_method,
      balanceDue: Number(o.balance_due || 0),
      hold: withDetail(holdOf(o.not_for_shipping_reason, latestLog.get(o.id)), details.get(o.id) || null),
      others,
    });
  }
  return out;
}
