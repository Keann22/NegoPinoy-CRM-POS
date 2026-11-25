import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyNames, notifyOwners } from '@/lib/services/customer-returns/customer-return-service';
import { getAdminAndInventoryLeadNames } from '@/lib/services/staff-message-service';
import { recordStoreCreditEntry } from '@/lib/services/payments/store-credit-service';
import { round2 } from '@/lib/services/payments/order-payment-rules';
import {
  CLOSED_ANSWERS, SUPPLIER_FLAG_RULES, WAIT_ANSWERS, canWait,
} from '@/lib/supplier-stock/supplier-flag-rules';
import {
  SupplierFlagError, getWaitingLines, latestAnswers, toFlags, uncoveredLineKeys, type FlagRow, type WaitingLine,
} from './supplier-flag-service';
import type { SupplierFlagCaller } from './supplier-flag-caller';
import type { SupplierFlag, SupplierPrompt, SupplierPromptAnswer, SupplierPromptKind } from '@/types/supplier-stock.types';

/**
 * The sales pop-up for items out at the supplier (owner, 2026-11-20). Sales
 * agents don't watch the bell, so each order waiting on a flagged item pops up
 * for its agent until they answer; owners see it too after 3 days. After a paid
 * line is removed (or a paid order cancelled), the agent picks store credit or
 * refund (refunds go to the owners).
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** "Change or remove the item" opens the order; if the item is still there after this, ask again. */
const EDITING_GRACE_HOURS = 1;

const shortId = (id: string) => `#${id.slice(0, 7).toUpperCase()}`;
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function flagRowsForPrompts(supabase: SupabaseClient): Promise<FlagRow[]> {
  const since = new Date(Date.now() - SUPPLIER_FLAG_RULES.moneyAfterClearDays * DAY).toISOString();
  const { data, error } = await supabase
    .from('supplier_stock_flags')
    .select('id, product_id, status, note, alt_product_id, alt_product_ids, new_price, check_again_on, set_by_name, set_at, cleared_at')
    .or(`cleared_at.is.null,cleared_at.gt.${since}`);
  if (error) throw error;
  return (data || []) as FlagRow[];
}

function basePrompt(f: SupplierFlag, l: WaitingLine, kind: SupplierPromptKind, amount = 0): SupplierPrompt {
  return {
    key: `${f.id}:${l.orderId}`, kind, flagId: f.id, orderId: l.orderId, status: f.status,
    productName: f.productName, note: f.note, altProductName: f.altProductName, altProductNames: f.altProductNames, newPrice: f.newPrice,
    customerName: l.customerName, agent: l.agent, orderStatus: l.orderStatus, qty: l.qty,
    paid: l.paid, total: l.total, amount, flaggedAt: f.setAt, waitingCustomerAt: null, escalated: false,
  };
}

/** Every prompt, before choosing who sees it. Writes "asked" for orders seen the first time. */
export async function buildAllPrompts(supabase: SupabaseClient): Promise<SupplierPrompt[]> {
  const rows = await flagRowsForPrompts(supabase);
  if (rows.length === 0) return [];
  const flags = await toFlags(supabase, rows);
  const flagById = new Map(flags.map((f) => [f.id, f]));
  const activeIds = new Set(rows.filter((r) => !r.cleared_at).map((r) => r.id));
  const [lines, answers] = await Promise.all([
    getWaitingLines(supabase, Array.from(new Set(rows.filter((r) => !r.cleared_at).map((r) => r.product_id)))),
    latestAnswers(supabase, rows.map((r) => r.id)),
  ]);
  const uncovered = await uncoveredLineKeys(supabase, lines);
  const now = Date.now();
  const prompts: SupplierPrompt[] = [];
  const firstSeen: { flag_id: string; order_id: string; answer: 'asked' }[] = [];
  const stillWaiting = new Set<string>();

  for (const f of flags) {
    if (!activeIds.has(f.id)) continue;
    for (const l of lines.filter((x) => x.productId === f.productId)) {
      const key = `${f.id}:${l.orderId}`;
      stillWaiting.add(key);
      // The shelf has pieces for this order: nothing to ask.
      if (!uncovered.has(`${l.orderId}:${f.productId}`)) continue;
      const a = answers.get(key);
      if (!a) firstSeen.push({ flag_id: f.id, order_id: l.orderId, answer: 'asked' });
      const askedSince = Math.max(new Date(f.setAt).getTime(), new Date(l.orderDate).getTime());
      const escalated = now - askedSince >= SUPPLIER_FLAG_RULES.escalateDays * DAY;
      if (!a || a.answer === 'asked') {
        prompts.push({ ...basePrompt(f, l, 'decide'), escalated });
      } else if (a.answer === 'waiting_customer' || a.answer === 'editing') {
        if (a.askAgainAt && new Date(a.askAgainAt).getTime() > now) continue;
        prompts.push({ ...basePrompt(f, l, 'decide'), escalated, waitingCustomerAt: a.answer === 'waiting_customer' ? a.at : null });
      } else if (WAIT_ANSWERS.includes(a.answer) && canWait(f.status)) {
        if (now - new Date(a.at).getTime() >= SUPPLIER_FLAG_RULES.reaskWaitDays * DAY) {
          prompts.push(basePrompt(f, l, 'still_waiting'));
        }
      }
    }
  }
  if (firstSeen.length > 0) await supabase.from('supplier_flag_answers').insert(firstSeen);

  // Money step: orders that were waiting and aren't anymore.
  const left = Array.from(answers.entries())
    .filter(([key, a]) => !stillWaiting.has(key) && !CLOSED_ANSWERS.includes(a.answer))
    .map(([key]) => { const [flagId, orderId] = key.split(':'); return { flagId, orderId }; });
  if (left.length === 0) return prompts;

  const orderIds = Array.from(new Set(left.map((x) => x.orderId)));
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, status, order_date, sales_person_name, customer_id, amount_paid, total_amount, customers(full_name), order_items(product_id, quantity)')
    .in('id', orderIds);
  if (error) throw error;
  const orderById = new Map((orders || []).map((o: any) => [o.id, o]));
  const closed: { flag_id: string; order_id: string; answer: 'gone'; note: string }[] = [];

  for (const { flagId, orderId } of left) {
    const f = flagById.get(flagId);
    const o: any = orderById.get(orderId);
    if (!f || !o) continue;
    const paid = Number(o.amount_paid) || 0;
    const total = Number(o.total_amount) || 0;
    const stillOnOrder = (o.order_items || []).some((i: any) => i.product_id === f.productId);
    const line: WaitingLine = {
      orderId, productId: f.productId, qty: 0, orderStatus: o.status, orderDate: o.order_date,
      agent: o.sales_person_name || null, customerName: o.customers?.full_name || 'Customer',
      customerId: o.customer_id || null, paid, total, fromOs: false,
    };
    if (o.status === 'Cancelled' && paid > 0.009) {
      prompts.push(basePrompt(f, line, 'money_cancelled', round2(paid)));
    } else if (o.status !== 'Cancelled' && !stillOnOrder && paid - total > 0.009) {
      prompts.push(basePrompt(f, line, 'money_removed', round2(paid - total)));
    } else {
      // Picked, item removed from an unpaid order, or the status changed: nothing left to ask.
      closed.push({ flag_id: flagId, order_id: orderId, answer: 'gone', note: `Order now ${o.status}${stillOnOrder ? '' : ', item removed'}` });
    }
  }
  if (closed.length > 0) await supabase.from('supplier_flag_answers').insert(closed);
  return prompts;
}

/** The prompts this person should see: their own orders; owners also see escalated and agent-less ones. */
export async function listSupplierPrompts(supabase: SupabaseClient, caller: SupplierFlagCaller): Promise<SupplierPrompt[]> {
  const me = caller.name.trim().toLowerCase();
  const all = await buildAllPrompts(supabase);
  return all
    .filter((p) => {
      const agent = (p.agent || '').trim().toLowerCase();
      if (agent && agent === me) return true;
      return caller.isManagement && (p.escalated || !agent);
    })
    .sort((a, b) => Number(b.paid > 0) - Number(a.paid > 0) || a.flaggedAt.localeCompare(b.flaggedAt));
}

/** Save an answer from the pop-up. */
export async function answerSupplierPrompt(
  supabase: SupabaseClient,
  input: { flagId: string; orderId: string; answer: SupplierPromptAnswer; note?: string | null },
  caller: SupplierFlagCaller,
): Promise<void> {
  const prompt = (await buildAllPrompts(supabase)).find((p) => p.flagId === input.flagId && p.orderId === input.orderId);
  if (!prompt) throw new SupplierFlagError('This was already answered. Refresh the page.');
  const money = prompt.kind === 'money_removed' || prompt.kind === 'money_cancelled';
  const allowed: SupplierPromptAnswer[] = money
    ? (prompt.kind === 'money_removed' ? ['keep_credit', 'refund'] : ['credit_added', 'refund', 'handled'])
    : ['waiting_customer', 'editing', ...(canWait(prompt.status) ? ['wait' as const] : [])];
  if (!allowed.includes(input.answer)) throw new SupplierFlagError('That answer does not fit this order.');

  const row: Record<string, unknown> = {
    flag_id: input.flagId, order_id: input.orderId, answer: input.answer,
    note: input.note?.trim() || null, by_name: caller.name, amount: money ? prompt.amount : null,
  };
  if (input.answer === 'waiting_customer') row.ask_again_at = new Date(Date.now() + SUPPLIER_FLAG_RULES.askAgainHours * HOUR).toISOString();
  if (input.answer === 'editing') row.ask_again_at = new Date(Date.now() + EDITING_GRACE_HOURS * HOUR).toISOString();

  if (input.answer === 'credit_added') await addCancelledCredit(supabase, prompt, caller.name);
  const { error } = await supabase.from('supplier_flag_answers').insert(row);
  if (error) throw error;

  const order = `${prompt.customerName} (${shortId(prompt.orderId)})`;
  if (input.answer === 'refund') {
    await notifyOwners(supabase, 'Refund: item out at supplier',
      `${order}: ${prompt.productName} ${prompt.kind === 'money_cancelled' ? 'order was cancelled' : 'was removed'}. ` +
        `${caller.name} says refund ${peso(prompt.amount)}.` +
        (prompt.kind === 'money_removed' ? ' It is in their store credit until refunded.' : ''),
      undefined, `/dashboard/orders/${prompt.orderId}`);
  } else if (input.answer === 'wait' && prompt.status === 'price_up') {
    // Sales can't change prices on an order; owners and Jas update it.
    const names = await getAdminAndInventoryLeadNames(supabase);
    await notifyNames(supabase, names, 'Customer agrees to the new price',
      `${order}: ${prompt.productName}${prompt.newPrice ? ` at ${peso(prompt.newPrice)}` : ''}. Update the price on the order, then buy it.`,
      `/dashboard/orders/${prompt.orderId}`);
  }
}

/** Cancelled paid order: put what they paid into store credit (with a ledger row). */
async function addCancelledCredit(supabase: SupabaseClient, p: SupplierPrompt, actorName: string) {
  const { data: o } = await supabase.from('orders').select('customer_id').eq('id', p.orderId).single();
  if (!o?.customer_id) throw new SupplierFlagError('This order has no customer to give store credit to.');
  const { data: c, error } = await supabase.from('customers').select('store_credit').eq('id', o.customer_id).single();
  if (error || !c) throw new SupplierFlagError('Customer not found.');
  const balance = round2((Number(c.store_credit) || 0) + p.amount);
  const { error: upErr } = await supabase.from('customers').update({ store_credit: balance }).eq('id', o.customer_id);
  if (upErr) throw upErr;
  await recordStoreCreditEntry(supabase, {
    customerId: o.customer_id, amount: p.amount, balanceAfter: balance,
    reason: 'cancelled_order', orderId: p.orderId, createdByName: actorName,
  });
}

/** New Order / Edit Order: the agent ticked "customer knows and agrees" for these items. */
export async function recordAgreedOnOrder(
  supabase: SupabaseClient, orderId: string, productIds: string[], actorName: string,
): Promise<void> {
  if (!orderId || productIds.length === 0) return;
  const { data, error } = await supabase.from('supplier_stock_flags').select('id')
    .in('product_id', productIds).is('cleared_at', null);
  if (error) throw error;
  const rows = (data || []).map((f: { id: string }) => ({ flag_id: f.id, order_id: orderId, answer: 'agreed_on_order', by_name: actorName }));
  if (rows.length > 0) await supabase.from('supplier_flag_answers').insert(rows);
}
