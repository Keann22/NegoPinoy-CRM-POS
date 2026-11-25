import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ASK_AGAIN_HOURS, OPEN_ORDER_STATUSES, OWNER_AFTER_DAYS, addDaysPht, holdComplete, orderReadiness, phtToday, shortOrderId,
  shortPhtDate,
} from '@/lib/shipping/ship-hold-rules';
import { listOpenRegularTasksForOrder, type TaskCaller } from '@/lib/services/staff-tasks/staff-task-service';
import {
  SHIP_HOLD_KINDS, type NewShipHold, type ShipHoldAnswer, type ShipHoldDetail, type ShipHoldFormData,
  type ShipHoldKind, type ShipHoldPrompt, type ShipVia,
} from '@/types/ship-holds.types';
import { resolvePickSkips } from './pick-skip-service';

/*
 * Structured "not for shipping yet" holds (owner, 2026-11-24, phase 2).
 * Found 2026-11-24: #020106B waited for the customer's other orders, but the
 * reason was free text only Packed Orders showed, so it looked ready to send.
 * Now sales pick a reason, a check-again date (default 7 days) and which orders
 * ship together. The order's sales agent gets a pop-up when the group is
 * complete (packed and paid) or on the check-again date; owners after 3 days.
 * Server only (service role).
 */

export class ShipHoldError extends Error {}

const TABLE = 'order_ship_holds';
const HOLD_COLS = 'id, order_id, group_id, kind, ship_via, note, check_on, ask_again_at, created_by_name, created_at';
const ORDER_COLS = 'id, status, balance_due, payment_method, sales_person_name, customer_id, not_for_shipping_reason, customers(full_name)';

interface HoldRow {
  id: string; order_id: string; group_id: string | null; kind: ShipHoldKind; ship_via: ShipVia;
  note: string | null; check_on: string; ask_again_at: string | null; created_by_name: string | null; created_at: string;
}
interface OrderRow {
  id: string; status: string; balance_due: number | string | null; payment_method: string | null;
  sales_person_name: string | null; customer_id: string | null; not_for_shipping_reason: string | null;
  customers?: { full_name: string | null } | { full_name: string | null }[] | null;
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const customerOf = (o: OrderRow) => one(o.customers)?.full_name || 'Customer';

/** The text sales and the warehouse see on the order (Packed Orders → Waiting to be Shipped). */
export function holdText(kind: ShipHoldKind, note: string, withShortIds: string[], via: ShipVia): string {
  let head = SHIP_HOLD_KINDS[kind].label;
  if (kind === 'with_orders' && withShortIds.length) head = `Ships with ${withShortIds.join(', ')}`;
  if (via === 'bus') head += ' (bus)';
  return note.trim() ? `${head}: ${note.trim()}` : head;
}

/** Holds grouped (a group's orders together), with their orders' readiness. */
function buildDetails(holds: HoldRow[], orders: Map<string, OrderRow>): Map<string, ShipHoldDetail> {
  const byKey = new Map<string, HoldRow[]>();
  holds.forEach((h) => { const k = h.group_id || h.id; byKey.set(k, [...(byKey.get(k) || []), h]); });
  const out = new Map<string, ShipHoldDetail>();
  byKey.forEach((rows) => {
    const first = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    const groupOrders = rows.map((h) => orders.get(h.order_id)).filter((o): o is OrderRow => !!o).map((o) => {
      const base = { status: o.status, balanceDue: Number(o.balance_due || 0), paymentMethod: o.payment_method };
      return { id: o.id, shortId: shortOrderId(o.id), ...base, ...orderReadiness(base, first.ship_via) };
    });
    const detail: ShipHoldDetail = {
      id: first.id,
      kind: first.kind,
      shipVia: first.ship_via,
      note: first.note,
      checkOn: rows.map((r) => r.check_on).sort()[0],
      groupId: first.group_id,
      orders: groupOrders,
      complete: holdComplete(first.kind, groupOrders, first.ship_via),
    };
    rows.forEach((h) => out.set(h.order_id, detail));
  });
  return out;
}

async function loadActive(supabase: SupabaseClient, filter?: { orderIds?: string[]; groupId?: string }) {
  let q = supabase.from(TABLE).select(HOLD_COLS).is('released_at', null);
  if (filter?.orderIds) q = q.in('order_id', filter.orderIds);
  if (filter?.groupId) q = q.eq('group_id', filter.groupId);
  const { data, error } = await q.limit(2000);
  if (error) throw error;
  let holds = (data || []) as HoldRow[];
  // Pull in the rest of any group touched, so readiness covers every order.
  const groupIds = Array.from(new Set(holds.map((h) => h.group_id).filter((g): g is string => !!g)));
  if (filter?.orderIds && groupIds.length) {
    const { data: more, error: e2 } = await supabase.from(TABLE).select(HOLD_COLS).is('released_at', null).in('group_id', groupIds);
    if (e2) throw e2;
    const seen = new Set(holds.map((h) => h.id));
    holds = [...holds, ...((more || []) as HoldRow[]).filter((h) => !seen.has(h.id))];
  }
  const orderIds = Array.from(new Set(holds.map((h) => h.order_id)));
  const orders = new Map<string, OrderRow>();
  for (let i = 0; i < orderIds.length; i += 150) {
    const { data: rows, error: e3 } = await supabase.from('orders').select(ORDER_COLS).in('id', orderIds.slice(i, i + 150));
    if (e3) throw e3;
    ((rows || []) as unknown as OrderRow[]).forEach((o) => orders.set(o.id, o));
  }
  return { holds, orders };
}

/** Structured hold per order (for the Priority List and the order context). */
export async function getHoldDetails(supabase: SupabaseClient, orderIds: string[]): Promise<Map<string, ShipHoldDetail>> {
  if (orderIds.length === 0) return new Map();
  const { holds, orders } = await loadActive(supabase, { orderIds });
  return buildDetails(holds, orders);
}

export async function getHoldForm(supabase: SupabaseClient, orderId: string, caller?: TaskCaller): Promise<ShipHoldFormData> {
  const { data: o, error } = await supabase.from('orders').select(ORDER_COLS).eq('id', orderId).single();
  if (error || !o) throw new ShipHoldError('Order not found.');
  const order = o as unknown as OrderRow;
  const [details, siblings, openTasks] = await Promise.all([
    getHoldDetails(supabase, [orderId]),
    order.customer_id
      ? supabase.from('orders').select('id, status, balance_due, payment_method, order_date')
        .eq('customer_id', order.customer_id).in('status', OPEN_ORDER_STATUSES).neq('id', orderId).order('order_date')
      : Promise.resolve({ data: [] as { id: string; status: string; balance_due: number | null; payment_method: string | null }[] }),
    caller ? listOpenRegularTasksForOrder(supabase, orderId, caller) : Promise.resolve([]),
  ]);
  return {
    orderId,
    shortId: shortOrderId(orderId),
    status: order.status,
    customerName: customerOf(order),
    holdText: order.not_for_shipping_reason,
    hold: details.get(orderId) || null,
    others: ((siblings.data || []) as { id: string; status: string; balance_due: number | null; payment_method: string | null }[])
      .map((s) => ({ id: s.id, shortId: shortOrderId(s.id), status: s.status, balanceDue: Number(s.balance_due || 0), paymentMethod: s.payment_method })),
    openTasks,
  };
}

async function logOrders(supabase: SupabaseClient, orderIds: string[], status: string, userName: string, snapshot: Record<string, unknown>) {
  if (orderIds.length === 0) return;
  await supabase.from('order_logs').insert(orderIds.map((id) => ({ order_id: id, status, user_name: userName, snapshot_data: snapshot })));
}

/** Hold (or change the hold on) an order and, when shipping together, the customer's chosen orders. */
export async function setShipHold(supabase: SupabaseClient, input: NewShipHold, actorName: string): Promise<string> {
  if (!SHIP_HOLD_KINDS[input.kind]) throw new ShipHoldError('Pick a reason.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.checkOn)) throw new ShipHoldError('Pick when to ask again.');
  if (input.checkOn < phtToday()) throw new ShipHoldError('The check-again date is in the past.');
  if (input.kind === 'other' && !input.note.trim()) throw new ShipHoldError('Write the reason in the note.');
  const withIds = input.kind === 'with_orders' ? Array.from(new Set(input.withOrderIds.filter((id) => id !== input.orderId))) : [];
  if (input.kind === 'with_orders' && withIds.length === 0) throw new ShipHoldError('Tick the orders it ships with.');

  const ids = [input.orderId, ...withIds];
  const { data: rows, error } = await supabase.from('orders').select('id, status, customer_id').in('id', ids);
  if (error) throw error;
  const orders = (rows || []) as { id: string; status: string; customer_id: string | null }[];
  const main = orders.find((o) => o.id === input.orderId);
  if (!main) throw new ShipHoldError('Order not found.');
  if (orders.length !== ids.length || orders.some((o) => o.customer_id !== main.customer_id)) {
    throw new ShipHoldError('Only the same customer’s orders can ship together.');
  }
  if (orders.some((o) => !OPEN_ORDER_STATUSES.includes(o.status))) throw new ShipHoldError('One of the orders already shipped or was cancelled.');

  const now = new Date().toISOString();
  // Replace any hold these orders already have (they may have been in another group).
  const { error: e1 } = await supabase.from(TABLE)
    .update({ released_at: now, released_by_name: actorName, release_reason: 'replaced' })
    .in('order_id', ids).is('released_at', null);
  if (e1) throw e1;

  const groupId = ids.length > 1 ? crypto.randomUUID() : null;
  const { error: e2 } = await supabase.from(TABLE).insert(ids.map((id) => ({
    order_id: id, group_id: groupId, kind: input.kind, ship_via: input.shipVia, note: input.note.trim() || null,
    check_on: input.checkOn, created_by_name: actorName, created_at: now,
  })));
  if (e2) throw e2;

  for (const id of ids) {
    const together = ids.filter((x) => x !== id).map(shortOrderId);
    const text = holdText(input.kind, input.note, together, input.shipVia);
    const { error: e3 } = await supabase.from('orders').update({ not_for_shipping_reason: text }).eq('id', id);
    if (e3) throw e3;
  }
  const summary = `${holdText(input.kind, input.note, withIds.map(shortOrderId), input.shipVia)} (ask again ${shortPhtDate(input.checkOn)})`;
  await logOrders(supabase, ids, 'Marked Not Ready to Ship', actorName, {
    reason: holdText(input.kind, input.note, withIds.map(shortOrderId), input.shipVia),
    kind: input.kind, checkOn: input.checkOn, shipVia: input.shipVia, groupId,
  });
  // Answers the warehouse's "Hindi pa ipi-pick" question, if there was one.
  await resolvePickSkips(supabase, ids, 'held', actorName);
  return summary;
}

/** The hold's whole group (or just the hold). */
async function groupOf(supabase: SupabaseClient, holdId: string): Promise<HoldRow[]> {
  const { data, error } = await supabase.from(TABLE).select(HOLD_COLS).eq('id', holdId).is('released_at', null).maybeSingle();
  if (error) throw error;
  if (!data) throw new ShipHoldError('This hold was already removed.');
  const hold = data as HoldRow;
  if (!hold.group_id) return [hold];
  const { data: rows, error: e2 } = await supabase.from(TABLE).select(HOLD_COLS).eq('group_id', hold.group_id).is('released_at', null);
  if (e2) throw e2;
  return (rows || []) as HoldRow[];
}

/** Ready: the orders go back to Ready to ship (Packed Orders → Verify). */
export async function releaseShipHold(supabase: SupabaseClient, holdId: string, actorName: string): Promise<string[]> {
  const rows = await groupOf(supabase, holdId);
  const ids = rows.map((r) => r.order_id);
  const now = new Date().toISOString();
  const { error } = await supabase.from(TABLE)
    .update({ released_at: now, released_by_name: actorName, release_reason: 'ready' })
    .in('id', rows.map((r) => r.id));
  if (error) throw error;
  const { error: e2 } = await supabase.from('orders').update({ not_for_shipping_reason: null }).in('id', ids);
  if (e2) throw e2;
  await logOrders(supabase, ids, 'Ready to Ship', actorName, { from: 'Hold released', orders: ids.map(shortOrderId) });
  return ids;
}

export async function answerShipHold(
  supabase: SupabaseClient, holdId: string, answer: ShipHoldAnswer, actorName: string, checkOn?: string,
): Promise<void> {
  if (answer === 'release') { await releaseShipHold(supabase, holdId, actorName); return; }
  const rows = await groupOf(supabase, holdId);
  const patch = answer === 'waiting'
    ? { ask_again_at: new Date(Date.now() + ASK_AGAIN_HOURS * 3600000).toISOString(), updated_by_name: actorName, updated_at: new Date().toISOString() }
    : (() => {
        const date = checkOn && /^\d{4}-\d{2}-\d{2}$/.test(checkOn) ? checkOn : '';
        if (!date || date <= phtToday()) throw new ShipHoldError('Pick a date after today.');
        return { check_on: date, ask_again_at: null, updated_by_name: actorName, updated_at: new Date().toISOString() };
      })();
  const { error } = await supabase.from(TABLE).update(patch).in('id', rows.map((r) => r.id));
  if (error) throw error;
}

/**
 * Pop-up cards: the group is complete (packed and paid) or the check-again date
 * came. For the orders' sales agent; owners also get those with no agent and
 * those unanswered for 3 days.
 */
export async function listShipHoldPrompts(
  supabase: SupabaseClient, caller: { name: string; isManagement: boolean },
): Promise<ShipHoldPrompt[]> {
  const { holds, orders } = await loadActive(supabase);
  const details = buildDetails(holds, orders);
  const me = caller.name.trim().toLowerCase();
  const today = phtToday();
  const ownerCutoff = addDaysPht(-OWNER_AFTER_DAYS);
  const nowMs = Date.now();
  const seen = new Set<string>();
  const out: ShipHoldPrompt[] = [];

  for (const h of holds) {
    const detail = details.get(h.order_id);
    if (!detail || seen.has(detail.id)) continue;
    seen.add(detail.id);
    const groupHolds = holds.filter((x) => details.get(x.order_id)?.id === detail.id);
    if (groupHolds.some((x) => x.ask_again_at && new Date(x.ask_again_at).getTime() > nowMs)) continue;
    // Only once something in the group is packed: before that the warehouse is still working on it.
    if (!detail.orders.some((o) => ['Picked', 'Photo', 'Packed', 'For Shipping'].includes(o.status))) continue;
    const reason = detail.complete ? 'complete' : detail.checkOn <= today ? 'check' : null;
    if (!reason) continue;

    const groupOrders = groupHolds.map((x) => orders.get(x.order_id)).filter((o): o is OrderRow => !!o);
    const agents = Array.from(new Set(groupOrders.map((o) => (o.sales_person_name || '').trim()).filter(Boolean)));
    const mine = agents.some((a) => a.toLowerCase() === me);
    const overdue = detail.checkOn <= ownerCutoff;
    if (!mine && !(caller.isManagement && (agents.length === 0 || overdue))) continue;

    const first = groupHolds.find((x) => x.id === detail.id) || h;
    const mainOrder = orders.get(first.order_id);
    out.push({
      id: detail.id,
      reason,
      detail,
      customerName: mainOrder ? customerOf(mainOrder) : 'Customer',
      salesPersonName: agents.join(', ') || null,
      heldByName: first.created_by_name,
      heldSince: first.created_at,
      holdText: mainOrder?.not_for_shipping_reason || null,
      overdue: !mine && overdue,
    });
  }
  // Complete groups first, then the oldest check date.
  return out.sort((a, b) => (a.reason === b.reason ? a.detail.checkOn.localeCompare(b.detail.checkOn) : a.reason === 'complete' ? -1 : 1));
}
