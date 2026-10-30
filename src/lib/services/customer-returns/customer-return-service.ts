import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CustomerReturn,
  CustomerReturnEvent,
  CustomerReturnItem,
  CustomerReturnOutcome,
  CustomerReturnsResponse,
  CustomerReturnStage,
  NewCustomerReturn,
  ReturnableOrderLine,
} from '@/types/customer-returns.types';
import { CR_OUTCOME_TODO } from '@/types/customer-returns.types';
import { resolveOpenOrderIssues } from '@/lib/services/order-issues-service';

/*
 * Customer Returns (phase 1). See architecture.md "Planned: Customer Returns".
 *
 * A case is opened (anyone, or automatically when courier sync marks an order
 * Returned), the owners decide what the customer gets and whether the item
 * must come back, staff check every returned piece Good or Damaged, and the
 * outcome is carried out. Stock:
 *   Good piece, once checked AND decided (not re-shipped) -> stock_level + qty,
 *     movement 'return' (mirrored to shelf_stock by the database)
 *   Damaged piece -> never back on the shelf
 * The order is set to Returned (never Cancelled: that would put every piece
 * back, damaged ones too).
 */

export class CustomerReturnError extends Error {}

const DAY_MS = 24 * 3600 * 1000;
const CLOSED_SHOWN_DAYS = 60;
/** Days a case may sit in a stage before it turns red. */
const STAGE_LIMIT_DAYS: Record<CustomerReturnStage, number> = {
  needs_owner: 1,
  to_check: 1,
  to_do: 2,
  waiting_parcel: 14,
  done: Infinity,
};

export const shortOrder = (id: string) => id.slice(0, 7).toUpperCase();

// ---------------------------------------------------------------------------
// Stage: where the case is now
// ---------------------------------------------------------------------------

export interface StageInput {
  status: string;
  outcome: CustomerReturnOutcome | null;
  ask_back: boolean;
  replacement_timing: string | null;
  decided_at: string | null;
  arrived_at: string | null;
  checked_at: string | null;
  outcome_done_at: string | null;
}

/** Can the outcome be carried out yet (or does it wait for the parcel)? */
export function outcomeCanRunNow(r: StageInput): boolean {
  if (!r.ask_back) return true;
  if (r.outcome === 'reship') return !!r.checked_at;
  if (r.replacement_timing === 'now') return true;
  return !!r.checked_at;
}

export function computeStage(r: StageInput, items: { damaged_qty: number; damaged_action: string | null }[]): CustomerReturnStage {
  if (r.status === 'closed') return 'done';
  if (r.ask_back && r.arrived_at && !r.checked_at) return 'to_check';
  if (!r.decided_at) return 'needs_owner';
  if (r.checked_at && items.some((i) => i.damaged_qty > 0 && !i.damaged_action)) return 'needs_owner';
  const todo = r.outcome ? CR_OUTCOME_TODO[r.outcome] : null;
  if (todo && !r.outcome_done_at && outcomeCanRunNow(r)) return 'to_do';
  if (r.ask_back && !r.arrived_at) return 'waiting_parcel';
  return 'done';
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export async function logEvent(supabase: SupabaseClient, returnId: string, event: string, actorName: string, note?: string | null) {
  await supabase.from('customer_return_events').insert({ return_id: returnId, event, note: note || null, actor_name: actorName });
}

/** Changes the order's status and writes the order log (stock is handled by the caller). */
export async function setOrderStatus(supabase: SupabaseClient, orderId: string, status: string, actorName: string) {
  const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
  if (error) throw error;
  await supabase.from('order_logs').insert({ order_id: orderId, status, user_name: actorName });
  if (status === 'Returned') await resolveOpenOrderIssues(supabase, orderId, actorName);
}

/** Bell notification for everyone whose role is owner/admin. */
export async function notifyOwners(supabase: SupabaseClient, title: string, message: string, exceptName?: string) {
  const { data, error } = await supabase.rpc('get_all_users');
  if (error) return;
  const skip = exceptName?.trim().toLowerCase();
  const names = Array.from(new Set(
    (data || [])
      .filter((u: any) => {
        const meta = u.raw_user_meta_data || {};
        const roles: string[] = Array.isArray(meta.roles) ? meta.roles : meta.role ? [meta.role] : [];
        return roles.some((r) => ['owner', 'admin'].includes(String(r).toLowerCase()));
      })
      .map((u: any) => `${u.raw_user_meta_data?.first_name || ''} ${u.raw_user_meta_data?.last_name || ''}`.trim())
      .filter((n: string) => n && n.toLowerCase() !== skip)
  ));
  await notifyNames(supabase, names as string[], title, message);
}

export async function notifyNames(supabase: SupabaseClient, names: string[], title: string, message: string) {
  const list = names.filter(Boolean);
  if (list.length === 0) return;
  await supabase.from('notifications').insert(list.map((name) => ({
    sales_person_name: name,
    title,
    message: message.length > 240 ? `${message.slice(0, 237)}...` : message,
    link: '/dashboard/inventory/returns',
    is_read: false,
  })));
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const daysSince = (iso: string, until: number) => Math.max(0, Math.floor((until - new Date(iso).getTime()) / DAY_MS));

/** When the case entered its current stage (for days and overdue). */
function stageSince(r: any, stage: CustomerReturnStage): string {
  if (stage === 'to_check') return r.arrived_at || r.created_at;
  if (stage === 'to_do' || stage === 'waiting_parcel') return r.decided_at || r.created_at;
  if (stage === 'needs_owner' && r.checked_at) return r.checked_at;
  return r.created_at;
}

function mapCase(r: any, now: number): CustomerReturn {
  const rawItems: any[] = r.customer_return_items || [];
  const stage = computeStage(r, rawItems);
  const items: CustomerReturnItem[] = rawItems
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((i) => ({
      id: i.id,
      orderItemId: i.order_item_id,
      productId: i.product_id,
      productName: i.product_name || 'Unknown product',
      qty: i.qty,
      goodQty: i.good_qty,
      damagedQty: i.damaged_qty,
      damagedAction: i.damaged_action,
    }));
  const events: CustomerReturnEvent[] = (r.customer_return_events || [])
    .sort((a: any, b: any) => a.created_at.localeCompare(b.created_at))
    .map((e: any) => ({ id: e.id, event: e.event, note: e.note, actorName: e.actor_name, createdAt: e.created_at }));
  const daysOpen = daysSince(r.created_at, r.closed_at ? new Date(r.closed_at).getTime() : now);
  const inStage = daysSince(stageSince(r, stage), now);
  return {
    id: r.id,
    caseNo: Number(r.case_no),
    orderId: r.order_id,
    orderStatus: r.orders?.status ?? null,
    customerName: r.orders?.customers?.full_name || 'Customer',
    salesPersonName: r.orders?.sales_person_name ?? null,
    source: r.source,
    reason: r.reason,
    notes: r.notes,
    photoUrls: r.photo_urls || [],
    status: r.status,
    stage,
    openedByName: r.opened_by_name,
    createdAt: r.created_at,
    outcome: r.outcome,
    askBack: r.ask_back,
    replacementTiming: r.replacement_timing,
    amount: Number(r.amount) || 0,
    courierClaim: !!r.courier_claim,
    decisionNote: r.decision_note,
    decidedAt: r.decided_at,
    decidedByName: r.decided_by_name,
    arrivedAt: r.arrived_at,
    checkedAt: r.checked_at,
    checkedByName: r.checked_by_name,
    restockedAt: r.restocked_at,
    outcomeDoneAt: r.outcome_done_at,
    outcomeDoneNote: r.outcome_done_note,
    closedAt: r.closed_at,
    daysOpen,
    isOverdue: stage !== 'done' && inStage > STAGE_LIMIT_DAYS[stage],
    damagedPending: !!r.checked_at && rawItems.some((i) => i.damaged_qty > 0 && !i.damaged_action),
    items,
    events,
  };
}

export async function listCustomerReturns(supabase: SupabaseClient, isManagement: boolean): Promise<CustomerReturnsResponse> {
  const closedSince = new Date(Date.now() - CLOSED_SHOWN_DAYS * DAY_MS).toISOString();
  const { data, error } = await supabase
    .from('customer_returns')
    .select('*, customer_return_items(*), customer_return_events(*), orders(status, sales_person_name, customers(full_name))')
    .or(`status.eq.open,closed_at.gte.${closedSince}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const now = Date.now();
  return { isManagement, returns: (data || []).map((r) => mapCase(r, now)) };
}

/** Loads one case in the same shape the list uses. */
export async function getCustomerReturn(supabase: SupabaseClient, id: string): Promise<CustomerReturn> {
  const { data, error } = await supabase
    .from('customer_returns')
    .select('*, customer_return_items(*), customer_return_events(*), orders(status, sales_person_name, customers(full_name))')
    .eq('id', id)
    .single();
  if (error || !data) throw new CustomerReturnError('Return case not found.');
  return mapCase(data, Date.now());
}

/** The order's lines and how many of each are already in an open case. */
export async function getReturnableLines(supabase: SupabaseClient, orderId: string): Promise<ReturnableOrderLine[]> {
  const [{ data: lines, error }, { data: open }] = await Promise.all([
    supabase.from('order_items').select('id, product_id, product_name, quantity').eq('order_id', orderId),
    supabase.from('customer_returns').select('customer_return_items(order_item_id, qty)').eq('order_id', orderId).eq('status', 'open'),
  ]);
  if (error) throw error;
  const inCase = new Map<string, number>();
  (open || []).forEach((c: any) => (c.customer_return_items || []).forEach((i: any) => {
    if (i.order_item_id) inCase.set(i.order_item_id, (inCase.get(i.order_item_id) || 0) + i.qty);
  }));
  return (lines || []).map((l: any) => ({
    orderItemId: l.id,
    productId: l.product_id,
    productName: l.product_name || 'Unknown product',
    orderedQty: Number(l.quantity) || 0,
    inOpenCaseQty: inCase.get(l.id) || 0,
  }));
}

// ---------------------------------------------------------------------------
// Open a case
// ---------------------------------------------------------------------------

export async function createCustomerReturn(supabase: SupabaseClient, input: NewCustomerReturn, actorName: string) {
  if (!input.orderId || !input.source || !input.reason) throw new CustomerReturnError('Order, what happened and the reason are needed.');
  const { data: order } = await supabase.from('orders').select('id, status, customers(full_name)').eq('id', input.orderId).maybeSingle();
  if (!order) throw new CustomerReturnError('Order not found.');

  const lines = await getReturnableLines(supabase, input.orderId);
  const byId = new Map(lines.map((l) => [l.orderItemId, l]));
  const picked = (input.items || [])
    .map((i) => ({ line: byId.get(i.orderItemId), qty: Math.round(Number(i.qty)) }))
    .filter((i) => i.line && i.qty > 0);
  if (picked.length === 0) throw new CustomerReturnError('Pick at least one item and quantity.');
  for (const p of picked) {
    const free = p.line!.orderedQty - p.line!.inOpenCaseQty;
    if (p.qty > free) throw new CustomerReturnError(`${p.line!.productName}: only ${free} left that aren't already in an open case.`);
  }

  // RTS parcels and items the customer ships back always come back; for a
  // damage report the owners decide whether to ask for it.
  const askBack = input.source !== 'damage_report';
  const now = new Date().toISOString();
  const { data: row, error } = await supabase
    .from('customer_returns')
    .insert({
      order_id: input.orderId,
      source: input.source,
      reason: input.reason,
      notes: input.notes?.trim() || null,
      photo_urls: (input.photoUrls || []).slice(0, 10),
      ask_back: askBack,
      arrived_at: input.source === 'rts' && input.parcelHere ? now : null,
      arrived_by_name: input.source === 'rts' && input.parcelHere ? actorName : null,
      opened_by_name: actorName,
    })
    .select('id, case_no')
    .single();
  if (error) throw error;

  const { error: iErr } = await supabase.from('customer_return_items').insert(picked.map((p) => ({
    return_id: row.id,
    order_item_id: p.line!.orderItemId,
    product_id: p.line!.productId,
    product_name: p.line!.productName,
    qty: p.qty,
  })));
  if (iErr) {
    await supabase.from('customer_returns').delete().eq('id', row.id);
    throw iErr;
  }
  await logEvent(supabase, row.id, 'opened', actorName, input.notes?.trim());
  if (input.source === 'rts' && order.status !== 'Returned') await setOrderStatus(supabase, input.orderId, 'Returned', actorName);

  const customer = (order as any).customers?.full_name || 'Customer';
  const pieces = picked.map((p) => `${p.qty}× ${p.line!.productName}`).join(', ');
  await notifyOwners(supabase, `Return #${row.case_no} needs your decision`,
    `#${shortOrder(input.orderId)} ${customer}: ${input.reason}. ${pieces}. Opened by ${actorName}.`, actorName);
  return { id: row.id as string, caseNo: Number(row.case_no) };
}

/**
 * Courier sync marked these orders Returned: open an RTS case (all lines) for
 * each one that has no open case yet. Returns how many were opened.
 */
export async function openCasesForCourierReturns(supabase: SupabaseClient, orderIds: string[], actorName: string): Promise<number> {
  const ids = Array.from(new Set(orderIds.filter(Boolean))).slice(0, 200);
  if (ids.length === 0) return 0;
  const { data: existing } = await supabase.from('customer_returns').select('order_id').in('order_id', ids).eq('status', 'open');
  const skip = new Set((existing || []).map((e: any) => e.order_id));
  let opened = 0;
  for (const orderId of ids) {
    if (skip.has(orderId)) continue;
    try {
      const lines = await getReturnableLines(supabase, orderId);
      const items = lines.filter((l) => l.orderedQty > 0).map((l) => ({ orderItemId: l.orderItemId, qty: l.orderedQty }));
      if (items.length === 0) continue;
      await createCustomerReturn(supabase, { orderId, source: 'rts', reason: 'Returned by courier', items }, actorName);
      opened++;
    } catch (e) {
      console.error('auto RTS case failed for', orderId, e instanceof Error ? e.message : e);
    }
  }
  return opened;
}
