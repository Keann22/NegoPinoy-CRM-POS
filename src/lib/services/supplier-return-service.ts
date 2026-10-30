import { SupabaseClient } from '@supabase/supabase-js';
import type {
  NewSupplierReturn,
  SupplierReturn,
  SupplierReturnAction,
  SupplierReturnEvent,
  SupplierReturnsResponse,
  SupplierReturnStatus,
} from '@/types/supplier-returns.types';
import { UNPICKED_STATUSES, PICKED_WITH_ISSUE } from './inventory/shelf-stock-service';

/*
 * Supplier Returns (phase 1). See architecture.md "Planned: Supplier Returns".
 *
 * Stock:
 *   reported (set aside)  -> stock_level − qty, movement 'supplier_return' (mirrored to shelf_stock)
 *   handed back / closed  -> no change (the pieces were already taken out)
 *   replacement arrives   -> stock_level + qty, movement 'supplier_return'
 *   cancelled (not bad)   -> stock_level + open qty, back on the shelf
 * Replacements use 'supplier_return', not RESTOCK, so they don't show up as
 * uncosted purchases on Encode Costs.
 *
 * Supplier names and costs are for owners only: listSupplierReturns blanks them
 * for everyone else, and owner actions are checked by the API route.
 */

const DEFAULT_LIMIT_DAYS = 7;
const CLOSED_SHOWN_DAYS = 60;
const DAY_MS = 24 * 3600 * 1000;

export class SupplierReturnError extends Error {}

const daysBetween = (from: string, to: number) => Math.max(0, Math.floor((to - new Date(from).getTime()) / DAY_MS));

async function moveStock(supabase: SupabaseClient, productId: string, qty: number, reason: string, actorName: string) {
  const { error } = await supabase.rpc('increment_stock', { p_product_id: productId, qty });
  if (error) throw error;
  const { error: mErr } = await supabase.from('inventory_movements').insert({
    product_id: productId,
    quantity_change: qty,
    movement_type: 'supplier_return',
    timestamp: new Date().toISOString(),
    reason,
    performed_by_name: actorName,
  });
  if (mErr) console.error('supplier return movement insert failed:', mErr.message);
}

async function logEvent(
  supabase: SupabaseClient,
  returnId: string,
  event: string,
  actorName: string,
  extra: { qty?: number; amount?: number; note?: string } = {}
) {
  await supabase.from('supplier_return_events').insert({
    return_id: returnId,
    event,
    qty: extra.qty ?? null,
    amount: extra.amount ?? null,
    note: extra.note ?? null,
    actor_name: actorName,
  });
}

/** Products that an open order still needs (customer waiting). */
async function productsCustomersWaitFor(supabase: SupabaseClient, productIds: string[]): Promise<Set<string>> {
  const waiting = new Set<string>();
  if (productIds.length === 0) return waiting;
  const [lines, issues] = await Promise.all([
    supabase.from('order_items').select('product_id, is_packed, orders!inner(status)')
      .in('product_id', productIds).in('orders.status', UNPICKED_STATUSES),
    supabase.from('order_issues').select('product_id, orders!inner(status)')
      .in('product_id', productIds).eq('status', 'open').eq('orders.status', PICKED_WITH_ISSUE),
  ]);
  (lines.data || []).forEach((l: any) => { if (!l.is_packed) waiting.add(l.product_id); });
  (issues.data || []).forEach((i: any) => waiting.add(i.product_id));
  return waiting;
}

export async function listSupplierReturns(supabase: SupabaseClient, isManagement: boolean): Promise<SupplierReturnsResponse> {
  const closedSince = new Date(Date.now() - CLOSED_SHOWN_DAYS * DAY_MS).toISOString();
  const { data: rows, error } = await supabase
    .from('supplier_returns')
    .select('*, products(name, sku, supplier_id, supplier_pricing, initial_unit_cost), suppliers(name, replacement_days), supplier_return_events(*)')
    .or(`status.neq.closed,closed_at.gte.${closedSince}`)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const now = Date.now();
  const waiting = await productsCustomersWaitFor(supabase, Array.from(new Set((rows || []).map((r: any) => r.product_id))));

  const returns: SupplierReturn[] = (rows || []).map((r: any) => {
    const status = r.status as SupplierReturnStatus;
    const openQty = status === 'closed' ? 0 : Math.max(0, r.qty - r.replaced_qty);
    const limitDays = Number(r.suppliers?.replacement_days) || DEFAULT_LIMIT_DAYS;
    const since = r.handed_back_at || r.created_at;
    const daysWaiting = daysBetween(since, r.closed_at ? new Date(r.closed_at).getTime() : now);
    const pricing: any[] = Array.isArray(r.products?.supplier_pricing) ? r.products.supplier_pricing : [];
    const suggestedSupplierId = r.products?.supplier_id || pricing.find((p) => p?.supplierId)?.supplierId || null;
    const unitCost = r.unit_cost != null ? Number(r.unit_cost) : null;
    const events: SupplierReturnEvent[] = (r.supplier_return_events || [])
      .sort((a: any, b: any) => a.created_at.localeCompare(b.created_at))
      .map((e: any) => ({
        id: e.id,
        event: e.event,
        qty: e.qty,
        amount: isManagement ? (e.amount != null ? Number(e.amount) : null) : null,
        note: e.note,
        actorName: e.actor_name,
        createdAt: e.created_at,
      }));
    return {
      id: r.id,
      returnNo: Number(r.return_no),
      productId: r.product_id,
      productName: r.products?.name || 'Unknown product',
      sku: r.products?.sku || null,
      qty: r.qty,
      replacedQty: r.replaced_qty,
      openQty,
      reason: r.reason,
      foundAt: r.found_at,
      notes: r.notes,
      status,
      outcome: r.outcome,
      reportedByName: r.reported_by_name,
      createdAt: r.created_at,
      handedBackAt: r.handed_back_at,
      handedBackByName: r.handed_back_by_name,
      closedAt: r.closed_at,
      closedByName: r.closed_by_name,
      daysWaiting,
      limitDays,
      isOverdue: status === 'with_supplier' && daysWaiting > limitDays,
      customerWaiting: status !== 'closed' && waiting.has(r.product_id),
      supplierId: isManagement ? r.supplier_id : null,
      supplierName: isManagement ? r.suppliers?.name || null : null,
      suggestedSupplierId: isManagement ? suggestedSupplierId : null,
      unitCost: isManagement ? unitCost : null,
      owedAmount: isManagement && unitCost != null ? openQty * unitCost : null,
      refundAmount: isManagement ? Number(r.refund_amount) || 0 : null,
      events,
    };
  });

  let suppliers: SupplierReturnsResponse['suppliers'] = [];
  if (isManagement) {
    const { data } = await supabase.from('suppliers').select('id, name, replacement_days').order('name');
    suppliers = (data || []).map((s: any) => ({ id: s.id, name: s.name, replacementDays: Number(s.replacement_days) || DEFAULT_LIMIT_DAYS }));
  }
  return { isManagement, returns, suppliers };
}

export async function createSupplierReturn(supabase: SupabaseClient, input: NewSupplierReturn, actorName: string) {
  const qty = Math.round(Number(input.qty));
  if (!input.productId || !(qty > 0) || !input.reason) throw new SupplierReturnError('Product, quantity and reason are needed.');

  const { data: product, error: pErr } = await supabase
    .from('products').select('id, name, assembly_recipe').eq('id', input.productId).single();
  if (pErr || !product) throw new SupplierReturnError('Product not found.');
  if (Array.isArray(product.assembly_recipe) && product.assembly_recipe.length > 0) {
    throw new SupplierReturnError('This is a bundle. Report the damaged part instead.');
  }

  const { data: row, error } = await supabase
    .from('supplier_returns')
    .insert({
      product_id: input.productId,
      qty,
      reason: input.reason,
      found_at: input.foundAt || 'shelf',
      notes: input.notes?.trim() || null,
      reported_by_name: actorName,
    })
    .select('id, return_no')
    .single();
  if (error) throw error;

  await moveStock(supabase, input.productId, -qty,
    `Set aside to return to supplier: return #${row.return_no} (${input.reason})`, actorName);
  await logEvent(supabase, row.id, 'reported', actorName, { qty, note: input.notes?.trim() || undefined });
  return { id: row.id as string, returnNo: Number(row.return_no) };
}

const OWNER_ACTIONS = new Set(['hand_back', 'close', 'set_supplier', 'cancel']);

export async function applySupplierReturnAction(
  supabase: SupabaseClient,
  a: SupplierReturnAction,
  actorName: string,
  isManagement: boolean
) {
  if (OWNER_ACTIONS.has(a.action) && !isManagement) throw new SupplierReturnError('Only the owners can do this.');

  const { data: r, error } = await supabase.from('supplier_returns').select('*').eq('id', a.id).single();
  if (error || !r) throw new SupplierReturnError('Return not found.');
  if (r.status === 'closed') throw new SupplierReturnError('This return is already closed.');
  const openQty = Math.max(0, r.qty - r.replaced_qty);
  const now = new Date().toISOString();

  // Each update is conditional on the row not having changed, so a double-tap
  // applies once and stock only moves when the update went through.
  const guardedUpdate = async (patch: Record<string, unknown>) => {
    const { data, error: uErr } = await supabase
      .from('supplier_returns')
      .update({ ...patch, updated_at: now })
      .eq('id', r.id)
      .eq('status', r.status)
      .eq('replaced_qty', r.replaced_qty)
      .select('id');
    if (uErr) throw uErr;
    if (!data || data.length === 0) throw new SupplierReturnError('Someone else just changed this return. Refresh and try again.');
  };

  switch (a.action) {
    case 'set_supplier': {
      await guardedUpdate({ supplier_id: a.supplierId || null, ...(a.unitCost != null ? { unit_cost: a.unitCost } : {}) });
      return;
    }
    case 'hand_back': {
      if (r.status !== 'to_return') throw new SupplierReturnError('Already handed back.');
      await guardedUpdate({
        status: 'with_supplier',
        handed_back_at: now,
        handed_back_by_name: actorName,
        ...(a.supplierId !== undefined ? { supplier_id: a.supplierId || null } : {}),
        ...(a.unitCost != null ? { unit_cost: a.unitCost } : {}),
      });
      await logEvent(supabase, r.id, 'handed_back', actorName, { qty: openQty });
      return;
    }
    case 'replacement': {
      const qty = Math.round(Number(a.qty));
      if (!(qty > 0) || qty > openQty) throw new SupplierReturnError(`Enter 1 to ${openQty}.`);
      const done = qty === openQty;
      await guardedUpdate({
        replaced_qty: r.replaced_qty + qty,
        ...(r.status === 'to_return' ? { status: 'with_supplier', handed_back_at: now, handed_back_by_name: actorName } : {}),
        ...(done ? { status: 'closed', outcome: 'replaced', closed_at: now, closed_by_name: actorName } : {}),
      });
      await moveStock(supabase, r.product_id, qty, `Replacement from supplier for return #${r.return_no}`, actorName);
      await logEvent(supabase, r.id, 'replacement', actorName, { qty });
      return;
    }
    case 'close': {
      const amount = Math.max(0, Number(a.amount) || 0);
      await guardedUpdate({
        status: 'closed',
        outcome: a.outcome,
        refund_amount: (Number(r.refund_amount) || 0) + amount,
        closed_at: now,
        closed_by_name: actorName,
      });
      await logEvent(supabase, r.id, a.outcome, actorName, { qty: openQty, amount, note: a.note });
      return;
    }
    case 'cancel': {
      if (r.status !== 'to_return') throw new SupplierReturnError('Only returns not yet handed back can be cancelled.');
      await guardedUpdate({ status: 'closed', outcome: 'cancelled', closed_at: now, closed_by_name: actorName });
      await moveStock(supabase, r.product_id, openQty, `Not returned to supplier, back on the shelf: return #${r.return_no}`, actorName);
      await logEvent(supabase, r.id, 'cancelled', actorName, { qty: openQty, note: a.note });
      return;
    }
  }
}

export async function setSupplierReplacementDays(supabase: SupabaseClient, supplierId: string, days: number) {
  const d = Math.round(Number(days));
  if (!(d >= 1 && d <= 365)) throw new SupplierReturnError('Enter 1 to 365 days.');
  const { error } = await supabase.from('suppliers').update({ replacement_days: d }).eq('id', supplierId);
  if (error) throw error;
}

export interface OwedReplacement {
  qty: number; // pieces suppliers still owe for this product (open returns)
  returnNos: number[];
  /** Earliest date a replacement is due (handed back + supplier's limit; reported date while not yet handed back). */
  dueAt: string | null;
}

/** Pieces suppliers still owe, per product, from open returns. Safe for staff (no supplier or cost). */
export async function getOwedReplacements(supabase: SupabaseClient, productIds?: string[]): Promise<Map<string, OwedReplacement>> {
  const owed = new Map<string, OwedReplacement>();
  if (productIds && productIds.length === 0) return owed;
  let query = supabase
    .from('supplier_returns')
    .select('product_id, qty, replaced_qty, return_no, created_at, handed_back_at, suppliers(replacement_days)')
    .neq('status', 'closed');
  if (productIds) query = query.in('product_id', productIds);
  const { data, error } = await query;
  if (error) {
    console.error('getOwedReplacements:', error.message);
    return owed;
  }
  for (const r of data || []) {
    const open = Math.max(0, Number(r.qty) - Number(r.replaced_qty));
    if (open <= 0) continue;
    const supplier: any = Array.isArray(r.suppliers) ? r.suppliers[0] : r.suppliers;
    const limit = Number(supplier?.replacement_days) || DEFAULT_LIMIT_DAYS;
    const due = new Date(new Date(r.handed_back_at || r.created_at).getTime() + limit * DAY_MS).toISOString();
    const cur = owed.get(r.product_id) || { qty: 0, returnNos: [], dueAt: null };
    cur.qty += open;
    cur.returnNos.push(Number(r.return_no));
    if (!cur.dueAt || due < cur.dueAt) cur.dueAt = due;
    owed.set(r.product_id, cur);
  }
  return owed;
}
