import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from './procurement-demand-service';
import { findStage } from '@/lib/online-order-tracking';
import {
  PRIORITY_RULES, rankOrder, compareRows, transitState, phtDate,
  type MissingItem, type PriorityOrderInput, type PriorityRow, type PriorityHold,
  type SendTodayMark, type SendTodayBlock, type BlockReason, type OsDecision,
} from '@/lib/priority/priority-rules';

/**
 * Builds the order priority list: every open order the shop owes the customer
 * (fully paid, COD, or a nearly-paid lay-away), with what is blocking it,
 * who owns the next step, and its rank. See priority-rules.ts for the rules.
 */

/** Open statuses that still need someone to act. For Pick-up = booked (done). */
const PRIORITY_STATUSES = [
  'Pending Payment', 'Processing', 'Picked', 'Picked (with issue)', 'Photo',
  'Packed', 'For Shipping', 'On-Hold', 'Waiting for Stock',
];

const CHUNK = 150;
const ORDER_COLUMNS = 'id, status, payment_method, total_amount, amount_paid, balance_due, order_date, created_at, packed_at, sales_person_name, customers(full_name)';
const DAY = 24 * 60 * 60 * 1000;
/** A buy request linked this long before the OS scan still belongs to that scan. */
const SOURCE_MATCH_SLACK_MS = 10 * 60 * 1000;

export const PRIORITY_EVENTS_TABLE = 'order_priority_events';
const SEND_KINDS = ['send_today', 'send_today_blocked', 'send_today_cancelled'];
/** Send-today marks older than this are ignored (an order marked and never booked shows as late until then). */
const SEND_LOOKBACK_DAYS = 30;

export interface PriorityListResult {
  rows: PriorityRow[];
  generatedAt: string;
  /** False until scripts/migrations/add_order_priority_events.sql has been run. */
  eventsReady: boolean;
}

async function inChunks<T>(ids: string[], fetchChunk: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await fetchChunk(ids.slice(i, i + CHUNK))));
  return out;
}

function isMissingTable(error: any): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205' || /does not exist|schema cache/i.test(error?.message || '');
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

function productLabel(p: any): string {
  if (!p) return 'Unknown item';
  return p.variant_name && !String(p.name).includes(p.variant_name) ? `${p.name} [${p.variant_name}]` : p.name;
}

/** Orders with a recent send-today event (mark, block or cancel). */
async function sendTodayOrderIds(supabase: SupabaseClient, now: Date): Promise<Set<string>> {
  try {
    const since = new Date(now.getTime() - SEND_LOOKBACK_DAYS * DAY).toISOString();
    const rows = await fetchAllPages<any>((f, t) =>
      supabase.from(PRIORITY_EVENTS_TABLE).select('order_id').in('kind', SEND_KINDS).gte('created_at', since).order('id').range(f, t));
    return new Set(rows.map((r) => r.order_id));
  } catch (error) {
    if (isMissingTable(error)) return new Set();
    throw error;
  }
}

export async function getPriorityList(
  supabase: SupabaseClient,
  now = new Date(),
  opts: { onlyOrderIds?: string[] } = {}
): Promise<PriorityListResult> {
  // 1. Open orders, paginated past the 1000-row cap.
  const [orders, markedIds] = await Promise.all([
    opts.onlyOrderIds
      ? inChunks(opts.onlyOrderIds, (c) => fetchAllPages<any>((from, to) =>
          supabase.from('orders').select(ORDER_COLUMNS).in('status', PRIORITY_STATUSES).in('id', c).order('id').range(from, to)))
      : fetchAllPages<any>((from, to) =>
          supabase.from('orders').select(ORDER_COLUMNS).in('status', PRIORITY_STATUSES).order('id').range(from, to)),
    sendTodayOrderIds(supabase, now),
  ]);

  const isFullyPaid = (o: any) => Number(o.balance_due || 0) < 1;
  const isPrep = (o: any) =>
    o.payment_method === 'Lay-away' && !isFullyPaid(o) &&
    Number(o.total_amount) > 0 && Number(o.amount_paid || 0) / Number(o.total_amount) >= PRIORITY_RULES.prepPaidRatio;
  // Anything sales marked "send today" is on the list even if it still owes.
  const eligible = orders.filter((o) => isFullyPaid(o) || o.payment_method === 'COD' || isPrep(o) || markedIds.has(o.id));
  const ids = eligible.map((o) => o.id);

  // 2. Everything else, keyed by order.
  const [payments, issues, sources, events, borrows, logs] = await Promise.all([
    inChunks(ids, (c) => fetchAllPages<any>((f, t) =>
      supabase.from('payments').select('order_id, payment_date, created_at').in('order_id', c).order('id').range(f, t))),
    inChunks(ids, (c) => fetchAllPages<any>((f, t) =>
      supabase.from('order_issues').select('order_id, product_id, status, out_of_stock_qty, created_at')
        .eq('issue_type', 'order').in('order_id', c).order('id').range(f, t))),
    inChunks(ids, (c) => fetchAllPages<any>((f, t) =>
      supabase.from('procurement_request_sources').select('order_id, purchase_order_item_id, created_at').in('order_id', c).order('id').range(f, t))),
    loadEvents(supabase, ids),
    loadBorrows(supabase, ids),
    inChunks(ids, (c) => fetchAllPages<any>((f, t) =>
      supabase.from('order_logs').select('order_id, created_at').in('order_id', c).order('id').range(f, t))),
  ]);

  const poiIds = Array.from(new Set(sources.map((s) => s.purchase_order_item_id).filter(Boolean)));
  const openProductIds = Array.from(new Set(issues.filter((i) => i.status === 'open' && i.product_id).map((i) => i.product_id)));

  const [pois, receipts, products] = await Promise.all([
    inChunks(poiIds, (c) => fetchAllPages<any>((f, t) =>
      supabase.from('purchase_order_items')
        .select('id, product_id, expected_qty, received_qty, status, created_at, purchase_orders(notes, created_at, tracking_route, tracking_stage, expected_arrival)')
        .in('id', c).order('id').range(f, t))),
    inChunks(poiIds, (c) => fetchAllPages<any>((f, t) =>
      supabase.from('inventory_movements').select('po_item_id, timestamp').eq('movement_type', 'RESTOCK').in('po_item_id', c).order('id').range(f, t))),
    inChunks(openProductIds, (c) => fetchAllPages<any>((f, t) =>
      supabase.from('products').select('id, name, variant_name').in('id', c).order('id').range(f, t))),
  ]);

  const poiById = new Map(pois.map((p) => [p.id, p]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const receivedAt = new Map<string, string>();
  receipts.forEach((r) => receivedAt.set(r.po_item_id, maxIso(receivedAt.get(r.po_item_id) || null, r.timestamp)!));

  const lastPayment = new Map<string, string>();
  payments.forEach((p) => {
    const at = p.payment_date || p.created_at;
    if (at) lastPayment.set(p.order_id, maxIso(lastPayment.get(p.order_id) || null, at)!);
  });

  const lastActivity = new Map<string, string>();
  const touch = (orderId: string, at: string | null) => {
    if (at) lastActivity.set(orderId, maxIso(lastActivity.get(orderId) || null, at)!);
  };
  logs.forEach((l) => touch(l.order_id, l.created_at));
  payments.forEach((p) => touch(p.order_id, p.created_at));
  issues.forEach((i) => touch(i.order_id, i.created_at));
  events.rows.forEach((e) => touch(e.order_id, e.created_at));

  const issuesByOrder = groupBy(issues, (i) => i.order_id);
  const sourcesByOrder = groupBy(sources, (s) => s.order_id);
  const eventsByOrder = groupBy(events.rows, (e) => e.order_id);
  const borrowsByOrder = groupBy(borrows, (b) => b.from_order_id);

  const rows = eligible.map((o) => {
    const paidAt = o.payment_method === 'COD'
      ? o.order_date || o.created_at
      : isFullyPaid(o) ? maxIso(lastPayment.get(o.id) || null, o.order_date || o.created_at) : null;

    const orderIssues = issuesByOrder.get(o.id) || [];
    const missing = missingItems(orderIssues, sourcesByOrder.get(o.id) || [], poiById, receivedAt, productById, eventsByOrder.get(o.id) || [], borrowsByOrder.get(o.id) || [], now);
    const osRounds = new Set(orderIssues.map((i) => String(i.created_at).slice(0, 16))).size;
    const { followUps, lastFollowUp, hold, sendToday, sendTodayBlock } = summarizeEvents(eventsByOrder.get(o.id) || [], now);

    const input: PriorityOrderInput = {
      id: o.id,
      status: o.status,
      paymentMethod: o.payment_method,
      totalAmount: Number(o.total_amount || 0),
      amountPaid: Number(o.amount_paid || 0),
      balanceDue: Number(o.balance_due || 0),
      orderDate: o.order_date || o.created_at,
      packedAt: o.packed_at,
      lastActivityAt: maxIso(lastActivity.get(o.id) || null, o.packed_at),
      salesPersonName: o.sales_person_name,
      customerName: o.customers?.full_name || null,
      paidAt,
      missing,
      osRounds,
      followUps,
      lastFollowUp,
      hold,
      sendToday,
      sendTodayBlock,
    };
    return rankOrder(input, now);
  });

  rows.sort(compareRows);
  return { rows, generatedAt: now.toISOString(), eventsReady: events.ready };
}

/** What's still missing from an order, and where each item stands. */
function missingItems(
  orderIssues: any[],
  orderSources: any[],
  poiById: Map<string, any>,
  receivedAt: Map<string, string>,
  productById: Map<string, any>,
  orderEvents: any[],
  orderBorrows: any[],
  now: Date
): MissingItem[] {
  // Latest sales decision per product on this order.
  const decisions = new Map<string, MissingItem['decision']>();
  orderEvents
    .filter((e) => e.kind === 'os_decision' && e.product_id)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .forEach((e) => decisions.set(e.product_id, {
      kind: (e.reason_code || 'wait') as OsDecision, note: e.note, byName: e.created_by_name, at: e.created_at,
    }));

  const firstOsAt = new Map<string, string>();
  orderIssues.forEach((i) => {
    if (!i.product_id) return;
    const prev = firstOsAt.get(i.product_id);
    if (!prev || i.created_at < prev) firstOsAt.set(i.product_id, i.created_at);
  });

  const open = new Map<string, any>();
  orderIssues
    .filter((i) => i.status === 'open' && i.product_id)
    .forEach((i) => {
      const prev = open.get(i.product_id);
      if (!prev || i.created_at > prev.created_at) open.set(i.product_id, i);
    });

  return Array.from(open.values()).map((issue) => {
    const base = {
      productId: issue.product_id,
      name: productLabel(productById.get(issue.product_id)),
      qty: Number(issue.out_of_stock_qty || 1),
      eta: null as string | null,
      stageLabel: null as string | null,
      decision: decisions.get(issue.product_id) || null,
      borrowedFor: borrowFor(orderBorrows, issue),
    };

    // Sales decided to send the rest / drop it, but the item is still on the order.
    if (base.decision && base.decision.kind !== 'wait') {
      return { ...base, state: 'remove_item' as const, since: base.decision.at };
    }

    // A buy request counts for this OS scan if it was linked for this scan, or
    // hasn't been fully received yet. An older request whose stock already
    // arrived (and went elsewhere) doesn't cover a new OS scan.
    const issueAt = new Date(issue.created_at).getTime();
    const link = orderSources
      .map((s) => ({ s, poi: poiById.get(s.purchase_order_item_id) }))
      .filter(({ s, poi }) => poi?.product_id === issue.product_id &&
        (new Date(s.created_at).getTime() >= issueAt - SOURCE_MATCH_SLACK_MS || !isFullyReceived(poi)))
      .sort((a, b) => String(b.s.created_at).localeCompare(String(a.s.created_at)))[0];

    if (!link) {
      // "Customer will wait" with no buy request (e.g. the request failed): the buyer still owns it.
      if (base.decision?.kind === 'wait') return { ...base, state: 'buy' as const, since: base.decision.at };
      return { ...base, state: 'decide' as const, since: firstOsAt.get(issue.product_id) || issue.created_at };
    }

    const { s, poi } = link;
    const po = poi.purchase_orders || {};
    if (isFullyReceived(poi)) {
      return { ...base, state: 'arrived' as const, since: receivedAt.get(poi.id) || s.created_at };
    }
    if (po.notes === 'STAFF_DRAFT') {
      return { ...base, state: 'buy' as const, since: s.created_at };
    }
    const boughtAt = po.created_at || poi.created_at;
    const eta = po.expected_arrival || new Date(new Date(boughtAt).getTime() + PRIORITY_RULES.untrackedTransitDays * DAY).toISOString();
    return {
      ...base,
      state: transitState(eta, now),
      since: boughtAt,
      eta,
      stageLabel: findStage(po.tracking_route, po.tracking_stage)?.label || null,
    };
  });
}

/** The borrow that caused this OS issue (recorded at the same moment), if any. */
function borrowFor(orderBorrows: any[], issue: any): MissingItem['borrowedFor'] {
  const issueAt = new Date(issue.created_at).getTime();
  const b = orderBorrows
    .filter((x) => x.product_id === issue.product_id && Math.abs(new Date(x.created_at).getTime() - issueAt) < SOURCE_MATCH_SLACK_MS)
    .sort((a, z) => String(z.created_at).localeCompare(String(a.created_at)))[0];
  return b ? { toOrderId: b.to_order_id, byName: b.created_by_name, at: b.created_at } : null;
}

async function loadBorrows(supabase: SupabaseClient, ids: string[]): Promise<any[]> {
  try {
    return await inChunks(ids, (c) => fetchAllPages<any>((f, t) =>
      supabase.from('order_borrows').select('id, product_id, from_order_id, to_order_id, created_by_name, created_at').in('from_order_id', c).order('id').range(f, t)));
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

function isFullyReceived(poi: any): boolean {
  return poi.status === 'received' || Number(poi.received_qty || 0) >= Number(poi.expected_qty || 0);
}

function summarizeEvents(events: any[], now: Date) {
  const sorted = [...events].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const followUpRows = sorted.filter((e) => e.kind === 'followup');
  const last = followUpRows[followUpRows.length - 1];
  const holdRow = [...sorted].reverse().find((e) => e.kind === 'hold' || e.kind === 'hold_cleared');
  const hold: PriorityHold | null = holdRow?.kind === 'hold' && holdRow.hold_until
    ? { until: holdRow.hold_until, note: holdRow.note, byName: holdRow.created_by_name }
    : null;
  const sendRow = [...sorted].reverse().find((e) => SEND_KINDS.includes(e.kind));
  const sendToday: SendTodayMark | null = sendRow?.kind === 'send_today' && sendRow.send_date
    ? { date: sendRow.send_date, note: sendRow.note, byName: sendRow.created_by_name, at: sendRow.created_at }
    : null;
  const sendTodayBlock: SendTodayBlock | null = sendRow?.kind === 'send_today_blocked' && phtDate(sendRow.created_at) === phtDate(now)
    ? { reason: (sendRow.reason_code || 'other') as BlockReason, note: sendRow.note, byName: sendRow.created_by_name, at: sendRow.created_at }
    : null;
  return {
    sendToday,
    sendTodayBlock,
    followUps: followUpRows.length,
    lastFollowUp: last ? { note: last.note, byName: last.created_by_name, at: last.created_at } : null,
    hold,
  };
}

async function loadEvents(supabase: SupabaseClient, ids: string[]): Promise<{ rows: any[]; ready: boolean }> {
  try {
    const rows = await inChunks(ids, (c) => fetchAllPages<any>((f, t) =>
      supabase.from(PRIORITY_EVENTS_TABLE).select('*').in('order_id', c).order('id').range(f, t)));
    return { rows, ready: true };
  } catch (error) {
    if (isMissingTable(error)) return { rows: [], ready: false };
    throw error;
  }
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  });
  return map;
}

// ---- Writes (follow-ups and holds) ----

export type PriorityEventKind =
  | 'followup' | 'hold' | 'hold_cleared'
  | 'send_today' | 'send_today_blocked' | 'send_today_cancelled'
  | 'os_decision';

/** Just the orders due to go out today (for the warehouse reminder pop-up). */
export async function getSendTodayList(supabase: SupabaseClient, now = new Date()): Promise<PriorityRow[]> {
  const ids = Array.from(await sendTodayOrderIds(supabase, now));
  if (ids.length === 0) return [];
  const { rows } = await getPriorityList(supabase, now, { onlyOrderIds: ids });
  return rows.filter((r) => r.group === 'send_today');
}

export interface PriorityEditor {
  id: string;
  name: string;
}

export async function addPriorityEvent(
  supabase: SupabaseClient,
  input: {
    orderId: string;
    kind: PriorityEventKind;
    note?: string | null;
    holdUntil?: string | null;
    sendDate?: string | null;
    reasonCode?: BlockReason | OsDecision | null;
    productId?: string | null;
  },
  editor: PriorityEditor
): Promise<void> {
  const { error } = await supabase.from(PRIORITY_EVENTS_TABLE).insert({
    order_id: input.orderId,
    kind: input.kind,
    note: input.note?.trim() || null,
    hold_until: input.kind === 'hold' ? input.holdUntil : null,
    ...(input.kind === 'send_today' ? { send_date: input.sendDate } : {}),
    ...(input.kind === 'send_today_blocked' || input.kind === 'os_decision' ? { reason_code: input.reasonCode } : {}),
    ...(input.kind === 'os_decision' ? { product_id: input.productId } : {}),
    created_by_id: editor.id,
    created_by_name: editor.name,
  });
  if (error) {
    if (isMissingTable(error)) throw new Error('Priority list is not set up yet - run the order_priority_events migration.');
    if (['23514', '42703', 'PGRST204'].includes(error.code)) {
      throw new Error(input.kind === 'os_decision'
        ? 'OS decisions are not set up yet - run scripts/migrations/add_os_decisions_and_carryovers.sql.'
        : 'Send today is not set up yet - run scripts/migrations/add_send_today_to_priority_events.sql.');
    }
    throw error;
  }
}
