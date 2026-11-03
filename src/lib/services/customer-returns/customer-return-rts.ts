import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParcelOrderMatch, RtsDecisionPrompt } from '@/types/customer-returns.types';
import {
  createCustomerReturn,
  CustomerReturnError,
  getReturnableLines,
  isEscalated,
  logEvent,
  shortOrder,
} from './customer-return-service';

/*
 * Courier returns (RTS) as the team works them (owner, 2026-11-03;
 * docs/BUSINESS_WORKFLOW.md "Courier returns in practice"):
 *   1. inventory staff log the parcel when it is in their hands (order # / name)
 *   2. the order's agent answers resend / cancel (pop-up or Returns page), or
 *      "asked customer, waiting for reply" (asked again after 4 hours);
 *      all sales see it after 2 hours, owners after 3 days
 *   3. staff check the pieces, then send it out again or put the OK pieces back
 */

const HOUR_MS = 3600 * 1000;
const ASK_AGAIN_HOURS = 4;
const ALL_SALES_AFTER_HOURS = 2;
const PHT_OFFSET_MS = 8 * HOUR_MS;
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;

/** Four hours from now, moved to 9 AM PHT when that falls outside work hours. */
export function nextAskTime(now = Date.now()): string {
  const t = now + ASK_AGAIN_HOURS * HOUR_MS;
  const pht = new Date(t + PHT_OFFSET_MS);
  const h = pht.getUTCHours();
  if (h >= WORK_START_HOUR && h < WORK_END_HOUR) return new Date(t).toISOString();
  const day = new Date(Date.UTC(pht.getUTCFullYear(), pht.getUTCMonth(), pht.getUTCDate() + (h >= WORK_END_HOUR ? 1 : 0), WORK_START_HOUR));
  return new Date(day.getTime() - PHT_OFFSET_MS).toISOString();
}

async function guarded(supabase: SupabaseClient, r: any, patch: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('customer_returns')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', r.id)
    .eq('updated_at', r.updated_at)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new CustomerReturnError('Someone else just changed this case. Refresh and try again.');
}

// ---------------------------------------------------------------------------
// 1. Log the parcel
// ---------------------------------------------------------------------------

/** Orders matching an order # (first characters) or a customer name. */
export async function searchOrdersForParcel(supabase: SupabaseClient, query: string): Promise<ParcelOrderMatch[]> {
  const q = query.trim().replace(/^#/, '');
  if (q.length < 3) return [];
  let orders: any[] = [];
  const select = 'id, status, order_date, created_at, tracking_number, customers(full_name), order_items(product_name, quantity)';
  if (/^[0-9a-f]{4,8}$/i.test(q)) {
    // Order # prefix: a uuid range (no ::text casts in PostgREST).
    const p = q.toLowerCase();
    const { data } = await supabase.from('orders').select(select)
      .gte('id', `${p.padEnd(8, '0')}-0000-0000-0000-000000000000`)
      .lte('id', `${p.padEnd(8, 'f')}-ffff-ffff-ffff-ffffffffffff`)
      .limit(10);
    orders = data || [];
  }
  if (orders.length === 0) {
    const { data: customers } = await supabase.from('customers').select('id').ilike('full_name', `%${q}%`).limit(25);
    const ids = (customers || []).map((c: any) => c.id);
    if (ids.length > 0) {
      const { data } = await supabase.from('orders').select(select)
        .in('customer_id', ids).neq('status', 'Cancelled')
        .order('created_at', { ascending: false }).limit(10);
      orders = data || [];
    }
  }
  if (orders.length === 0) return [];
  const { data: open } = await supabase.from('customer_returns').select('order_id, case_no')
    .in('order_id', orders.map((o) => o.id)).eq('status', 'open');
  const openByOrder = new Map((open || []).map((c: any) => [c.order_id, Number(c.case_no)]));
  return orders.map((o) => ({
    orderId: o.id,
    shortId: shortOrder(o.id),
    customerName: o.customers?.full_name || 'Customer',
    status: o.status,
    orderDate: o.order_date || o.created_at,
    trackingNumber: o.tracking_number || null,
    items: (o.order_items || []).map((i: any) => `${i.quantity}× ${i.product_name}`).join(', '),
    openCaseNo: openByOrder.get(o.id) ?? null,
  }));
}

/**
 * The parcel is in staff's hands. Opens a courier-return case with the parcel
 * here (the order is marked Returned), or marks an existing open courier-return
 * case (e.g. from courier sync) as arrived.
 */
export async function logReturnedParcel(supabase: SupabaseClient, orderId: string, reason: string, actorName: string) {
  const { data: existing } = await supabase.from('customer_returns').select('*')
    .eq('order_id', orderId).eq('status', 'open').limit(1).maybeSingle();
  if (existing) {
    if (existing.source !== 'rts') throw new CustomerReturnError(`This order already has an open return case (#${existing.case_no}).`);
    if (!existing.arrived_at) {
      await guarded(supabase, existing, { arrived_at: new Date().toISOString(), arrived_by_name: actorName });
      await logEvent(supabase, existing.id, 'arrived', actorName);
    }
    return { id: existing.id as string, caseNo: Number(existing.case_no), existed: true };
  }
  const lines = await getReturnableLines(supabase, orderId);
  const items = lines.filter((l) => l.orderedQty - l.inOpenCaseQty > 0)
    .map((l) => ({ orderItemId: l.orderItemId, qty: l.orderedQty - l.inOpenCaseQty }));
  if (items.length === 0) throw new CustomerReturnError('This order has no items to return.');
  const out = await createCustomerReturn(supabase, {
    orderId, source: 'rts', reason: reason || 'Returned by courier', parcelHere: true, items,
  }, actorName);
  return { ...out, existed: false };
}

// ---------------------------------------------------------------------------
// 2. Sales: resend / cancel / waiting for the customer
// ---------------------------------------------------------------------------

export async function decideRts(
  supabase: SupabaseClient, r: any, choice: 'resend' | 'cancel', note: string | undefined, actorName: string, allowed: boolean
) {
  if (!allowed) throw new CustomerReturnError('Only sales and the owners can decide resend or cancel.');
  if (r.source !== 'rts') throw new CustomerReturnError('Resend / cancel is for parcels the courier sent back.');
  if (r.outcome_done_at || r.restocked_at || r.replacement_order_id) throw new CustomerReturnError('This case is already being carried out; the decision can no longer change.');
  if (choice !== 'resend' && choice !== 'cancel') throw new CustomerReturnError('Pick resend or cancel.');
  await guarded(supabase, r, {
    outcome: choice === 'resend' ? 'reship' : 'cancel_order',
    ask_back: true,
    replacement_timing: null,
    decision_note: note?.trim() || null,
    decided_at: new Date().toISOString(),
    decided_by_name: actorName,
    ask_again_at: null,
  });
  await logEvent(supabase, r.id, 'decided', actorName,
    [choice === 'resend' ? 'Resend to the customer' : 'Order cancelled', note?.trim()].filter(Boolean).join(' · '));
}

export async function waitForCustomer(
  supabase: SupabaseClient, r: any, note: string | undefined, actorName: string, allowed: boolean
) {
  if (!allowed) throw new CustomerReturnError('Only sales and the owners can answer this.');
  if (r.source !== 'rts' || r.decided_at) throw new CustomerReturnError('This case is already decided.');
  const askAt = nextAskTime();
  await guarded(supabase, r, {
    waiting_customer_at: r.waiting_customer_at || new Date().toISOString(),
    waiting_customer_by_name: r.waiting_customer_by_name || actorName,
    ask_again_at: askAt,
  });
  const when = new Date(askAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', hour: 'numeric', minute: '2-digit' });
  await logEvent(supabase, r.id, 'waiting_customer', actorName, [`Asked the customer; ask again ${when}`, note?.trim()].filter(Boolean).join(' · '));
}

// ---------------------------------------------------------------------------
// The pop-up: courier returns waiting on this person's answer
// ---------------------------------------------------------------------------

export async function listRtsPrompts(
  supabase: SupabaseClient,
  caller: { name: string; isManagement: boolean; isSales: boolean }
): Promise<RtsDecisionPrompt[]> {
  const { data, error } = await supabase
    .from('customer_returns')
    .select('*, customer_return_items(product_name, qty), orders!customer_returns_order_id_fkey(sales_person_name, customers(full_name))')
    .eq('status', 'open').eq('source', 'rts').is('decided_at', null);
  if (error) throw error;
  const now = Date.now();
  const me = caller.name.trim().toLowerCase();
  return (data || [])
    .filter((r: any) => !r.ask_again_at || new Date(r.ask_again_at).getTime() <= now)
    .filter((r: any) => {
      const agent = String(r.orders?.sales_person_name || '').trim().toLowerCase();
      // Clock runs from when sales was first asked (the case opening), not from a later "parcel here".
      const askedAt = new Date(r.created_at).getTime();
      if (agent && agent === me) return true;
      if (caller.isSales && now - askedAt >= ALL_SALES_AFTER_HOURS * HOUR_MS) return true;
      return caller.isManagement && isEscalated(r, now);
    })
    .map((r: any) => ({
      id: r.id,
      caseNo: Number(r.case_no),
      orderId: r.order_id,
      customerName: r.orders?.customers?.full_name || 'Customer',
      salesPersonName: r.orders?.sales_person_name || null,
      items: (r.customer_return_items || []).map((i: any) => `${i.qty}× ${i.product_name}`).join(', '),
      loggedAt: r.arrived_at || r.created_at,
      waitingCustomerAt: r.waiting_customer_at,
      escalated: isEscalated(r, now),
    }));
}
