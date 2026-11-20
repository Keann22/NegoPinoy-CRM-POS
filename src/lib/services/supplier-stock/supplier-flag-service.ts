import type { SupabaseClient } from '@supabase/supabase-js';
import { UNPICKED_STATUSES, PICKED_WITH_ISSUE } from '@/lib/services/inventory/shelf-stock-service';
import { notifyNames } from '@/lib/services/customer-returns/customer-return-service';
import { SUPPLIER_FLAG_LABELS, WAIT_ANSWERS } from '@/lib/supplier-stock/supplier-flag-rules';
import type {
  OldProcurementIssue, SetSupplierFlagInput, SupplierFlag, SupplierFlagAnswerKind,
  SupplierFlagClearReason, SupplierFlagStatus, SupplierFlagWithOrders,
} from '@/types/supplier-stock.types';

/**
 * Out of stock at the supplier (owner, 2026-11-20). Owners and Jas set a status
 * on a variant; sales answer per order (supplier-flag-prompts.ts). Supplier
 * names and costs never leave this file: only the status is shared.
 */

export class SupplierFlagError extends Error {}

const STATUSES: SupplierFlagStatus[] = ['waiting_restock', 'other_variant', 'price_up', 'stop_selling'];
const FLAG_COLUMNS = 'id, product_id, status, note, alt_product_id, new_price, check_again_on, set_by_name, set_at, cleared_at';

export interface FlagRow {
  id: string;
  product_id: string;
  status: SupplierFlagStatus;
  note: string | null;
  alt_product_id: string | null;
  new_price: number | string | null;
  check_again_on: string | null;
  set_by_name: string | null;
  set_at: string;
  cleared_at: string | null;
}

export interface WaitingLine {
  orderId: string;
  productId: string;
  qty: number;
  orderStatus: string;
  orderDate: string;
  agent: string | null;
  customerName: string;
  customerId: string | null;
  paid: number;
  total: number;
  /** Picked with this item reported OS: the picker already found none. */
  fromOs: boolean;
}

export const productLabel = (p: { name?: string | null; variant_name?: string | null } | null | undefined) => {
  if (!p?.name) return 'Item';
  const v = (p.variant_name || '').trim();
  return v && !p.name.includes(v) ? `${p.name} - ${v}` : p.name;
};

async function productNames(supabase: SupabaseClient, ids: string[]) {
  const out = new Map<string, { name: string; stock: number }>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return out;
  const { data, error } = await supabase.from('products').select('id, name, variant_name, stock_level').in('id', unique);
  if (error) throw error;
  (data || []).forEach((p: any) => out.set(p.id, { name: productLabel(p), stock: Number(p.stock_level) || 0 }));
  return out;
}

export async function getActiveFlagRows(supabase: SupabaseClient, productIds?: string[]): Promise<FlagRow[]> {
  let q = supabase.from('supplier_stock_flags').select(FLAG_COLUMNS).is('cleared_at', null);
  if (productIds) {
    if (productIds.length === 0) return [];
    q = q.in('product_id', productIds);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as FlagRow[];
}

export async function toFlags(supabase: SupabaseClient, rows: FlagRow[]): Promise<SupplierFlag[]> {
  const names = await productNames(supabase, rows.flatMap((r) => [r.product_id, r.alt_product_id || '']));
  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    productName: names.get(r.product_id)?.name || 'Item',
    status: r.status,
    note: r.note,
    altProductId: r.alt_product_id,
    altProductName: r.alt_product_id ? names.get(r.alt_product_id)?.name || null : null,
    newPrice: r.new_price == null ? null : Number(r.new_price),
    checkAgainOn: r.check_again_on,
    setByName: r.set_by_name,
    setAt: r.set_at,
    freeToSell: Math.max(0, names.get(r.product_id)?.stock ?? 0),
  }));
}

/** Active statuses (for New Order, the Procurement Sheet and badges). Optionally only some products. */
export async function listActiveFlags(supabase: SupabaseClient, productIds?: string[]): Promise<SupplierFlag[]> {
  return toFlags(supabase, await getActiveFlagRows(supabase, productIds));
}

/**
 * Open order lines still waiting for these products: not picked yet, or picked
 * with this item reported OS.
 */
export async function getWaitingLines(supabase: SupabaseClient, productIds: string[]): Promise<WaitingLine[]> {
  if (productIds.length === 0) return [];
  const orderCols = 'id, status, order_date, sales_person_name, customer_id, amount_paid, total_amount, customers(full_name)';
  const [lines, issues] = await Promise.all([
    supabase.from('order_items')
      .select(`product_id, quantity, is_packed, orders!inner(${orderCols})`)
      .in('product_id', productIds).in('orders.status', UNPICKED_STATUSES),
    supabase.from('order_issues')
      .select(`product_id, out_of_stock_qty, orders!inner(${orderCols})`)
      .in('product_id', productIds).eq('status', 'open').eq('issue_type', 'order').eq('orders.status', PICKED_WITH_ISSUE),
  ]);
  if (lines.error) throw lines.error;
  if (issues.error) throw issues.error;
  const out = new Map<string, WaitingLine>();
  const add = (productId: string, qty: number, o: any, fromOs: boolean) => {
    const key = `${o.id}:${productId}`;
    const prev = out.get(key);
    if (prev) { prev.qty += qty; return; }
    out.set(key, {
      orderId: o.id, productId, qty, orderStatus: o.status, orderDate: o.order_date,
      agent: o.sales_person_name || null, customerName: o.customers?.full_name || 'Customer',
      customerId: o.customer_id || null, paid: Number(o.amount_paid) || 0, total: Number(o.total_amount) || 0, fromOs,
    });
  };
  (lines.data || []).forEach((l: any) => { if (!l.is_packed) add(l.product_id, Number(l.quantity) || 1, l.orders, false); });
  (issues.data || []).forEach((i: any) => add(i.product_id, Number(i.out_of_stock_qty) || 1, i.orders, true));
  return Array.from(out.values());
}

/**
 * Orders the shelf can't cover: they need the customer asked. Pieces on the
 * shelf (free to sell + what unpicked orders hold) go to the oldest unpicked
 * orders first; a line the picker already marked OS is never covered.
 * Returns orderId:productId keys.
 */
export async function uncoveredLineKeys(supabase: SupabaseClient, lines: WaitingLine[]): Promise<Set<string>> {
  const ids = Array.from(new Set(lines.map((l) => l.productId)));
  const out = new Set<string>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase.from('products').select('id, stock_level').in('id', ids);
  if (error) throw error;
  const free = new Map((data || []).map((p: { id: string; stock_level: number | null }) => [p.id, Number(p.stock_level) || 0]));
  for (const id of ids) {
    const mine = lines.filter((l) => l.productId === id);
    const unpicked = mine.filter((l) => !l.fromOs).sort((a, b) => a.orderDate.localeCompare(b.orderDate));
    let shelf = Math.max(0, (free.get(id) || 0) + unpicked.reduce((n, l) => n + l.qty, 0));
    for (const l of unpicked) {
      if (l.qty <= shelf) shelf -= l.qty;
      else { out.add(`${l.orderId}:${id}`); shelf = 0; }
    }
    mine.filter((l) => l.fromOs).forEach((l) => out.add(`${l.orderId}:${id}`));
  }
  return out;
}

/** Latest answer per order for each flag. */
export async function latestAnswers(supabase: SupabaseClient, flagIds: string[]) {
  const out = new Map<string, { answer: SupplierFlagAnswerKind; byName: string | null; at: string; askAgainAt: string | null; amount: number | null }>();
  if (flagIds.length === 0) return out;
  const { data, error } = await supabase
    .from('supplier_flag_answers')
    .select('flag_id, order_id, answer, by_name, created_at, ask_again_at, amount')
    .in('flag_id', flagIds)
    .order('created_at', { ascending: true });
  if (error) throw error;
  (data || []).forEach((a: any) => out.set(`${a.flag_id}:${a.order_id}`, {
    answer: a.answer, byName: a.by_name, at: a.created_at, askAgainAt: a.ask_again_at,
    amount: a.amount == null ? null : Number(a.amount),
  }));
  return out;
}

/** Wala sa Supplier page: every active status with its waiting orders and sales' answers. */
export async function listFlagsWithOrders(supabase: SupabaseClient): Promise<SupplierFlagWithOrders[]> {
  const flags = await listActiveFlags(supabase);
  const [lines, answers] = await Promise.all([
    getWaitingLines(supabase, flags.map((f) => f.productId)),
    latestAnswers(supabase, flags.map((f) => f.id)),
  ]);
  const uncovered = await uncoveredLineKeys(supabase, lines);
  return flags
    .map((f) => ({
      ...f,
      orders: lines.filter((l) => l.productId === f.productId).map((l) => {
        const a = answers.get(`${f.id}:${l.orderId}`);
        return {
          orderId: l.orderId, customerName: l.customerName, agent: l.agent, paid: l.paid,
          covered: !uncovered.has(`${l.orderId}:${f.productId}`),
          answer: a?.answer ?? null, answeredBy: a?.byName ?? null, answeredAt: a?.at ?? null,
        };
      }),
    }))
    .sort((a, b) => b.setAt.localeCompare(a.setAt));
}

/** Set (or change) a product's status. A change starts a new flag, so sales are asked again. */
export async function setSupplierFlag(supabase: SupabaseClient, input: SetSupplierFlagInput, actorName: string): Promise<string> {
  if (!input.productId) throw new SupplierFlagError('Choose a product.');
  if (!STATUSES.includes(input.status)) throw new SupplierFlagError('Choose a status.');
  if (input.status === 'other_variant' && input.altProductId === input.productId) {
    throw new SupplierFlagError('The other color/size must be a different variant.');
  }
  const { data: kids } = await supabase.from('products').select('id').eq('parent_id', input.productId).limit(1);
  if (kids && kids.length > 0) throw new SupplierFlagError('Set it on the variant (color/size), not on the main product.');

  const now = new Date().toISOString();
  const { error: clearErr } = await supabase.from('supplier_stock_flags')
    .update({ cleared_at: now, cleared_by_name: actorName, clear_reason: 'changed' })
    .eq('product_id', input.productId).is('cleared_at', null);
  if (clearErr) throw clearErr;

  const { data, error } = await supabase.from('supplier_stock_flags').insert({
    product_id: input.productId,
    status: input.status,
    note: input.note?.trim() || null,
    alt_product_id: input.status === 'other_variant' ? input.altProductId || null : null,
    new_price: input.status === 'price_up' && input.newPrice ? Number(input.newPrice) : null,
    check_again_on: input.status === 'stop_selling' ? null : input.checkAgainOn || null,
    set_by_name: actorName,
  }).select('id').single();
  if (error) throw error;

  // The old free-text reports for this product are replaced by the status.
  await closeOldIssues(supabase, input.productId, `Replaced by status "${SUPPLIER_FLAG_LABELS[input.status]}" (${actorName}).`);
  return data.id as string;
}

/**
 * Clear the status: back in stock (tapped), or bought (a purchase was recorded).
 * Agents whose customer agreed to wait are told it is coming.
 */
export async function clearSupplierFlag(
  supabase: SupabaseClient, productId: string, reason: SupplierFlagClearReason, actorName: string,
): Promise<boolean> {
  const rows = await getActiveFlagRows(supabase, [productId]);
  if (rows.length === 0) return false;
  const flag = rows[0];
  const { error } = await supabase.from('supplier_stock_flags')
    .update({ cleared_at: new Date().toISOString(), cleared_by_name: actorName, clear_reason: reason })
    .eq('id', flag.id).is('cleared_at', null);
  if (error) throw error;

  const [lines, answers, names] = await Promise.all([
    getWaitingLines(supabase, [productId]),
    latestAnswers(supabase, [flag.id]),
    productNames(supabase, [productId]),
  ]);
  const name = names.get(productId)?.name || 'The item';
  const byAgent = new Map<string, string[]>();
  lines.forEach((l) => {
    const a = answers.get(`${flag.id}:${l.orderId}`)?.answer;
    // Only orders sales was asked about (still waiting or agreed to wait).
    if (!l.agent || !a || !(WAIT_ANSWERS.includes(a) || a === 'asked' || a === 'waiting_customer')) return;
    byAgent.set(l.agent, [...(byAgent.get(l.agent) || []), `#${l.orderId.slice(0, 7).toUpperCase()} (${l.customerName})`]);
  });
  for (const [agent, orders] of byAgent) {
    await notifyNames(supabase, [agent], 'Available again',
      `${name} ${reason === 'bought' ? 'was bought' : 'is available again'}. Waiting order${orders.length === 1 ? '' : 's'}: ${orders.join(', ')}.`,
      `/dashboard/orders/${lines.find((l) => l.agent === agent)?.orderId || ''}`);
  }
  return true;
}

/** A purchase was recorded: the item isn't out at the supplier anymore. Never throws. */
export async function clearFlagOnPurchase(supabase: SupabaseClient, productId: string, actorName = 'System'): Promise<void> {
  try {
    await clearSupplierFlag(supabase, productId, 'bought', actorName);
  } catch (e) {
    console.error('clearFlagOnPurchase:', e instanceof Error ? e.message : e);
  }
}

// ---------------------------------------------------------------------------
// Old free-text reports (procurement_issues), shown until each is replaced
// ---------------------------------------------------------------------------

export async function listOldIssues(supabase: SupabaseClient): Promise<OldProcurementIssue[]> {
  const { data, error } = await supabase
    .from('procurement_issues')
    .select('id, product_id, created_at, products(name, variant_name), procurement_issue_messages(sender_name, message, created_at)')
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((i: any) => {
    const msgs = [...(i.procurement_issue_messages || [])].sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
    return {
      id: i.id,
      productId: i.product_id,
      productName: productLabel(i.products),
      note: msgs.map((m: any) => m.message).join(' / '),
      byName: msgs[0]?.sender_name || null,
      createdAt: i.created_at,
    };
  });
}

export async function closeOldIssues(supabase: SupabaseClient, productId: string, message: string, issueId?: string) {
  let q = supabase.from('procurement_issues').select('id').eq('status', 'open');
  q = issueId ? q.eq('id', issueId) : q.eq('product_id', productId);
  const { data } = await q;
  for (const issue of data || []) {
    await supabase.from('procurement_issues').update({ status: 'resolved' }).eq('id', issue.id);
    await supabase.from('procurement_issue_messages').insert({ issue_id: issue.id, sender_role: 'system', sender_name: 'System', message });
  }
}
