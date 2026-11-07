import { SupabaseClient } from '@supabase/supabase-js';
import { bundleQtyPerUnit, getUnpickedQtyForProduct, PICKED_WITH_ISSUE, unallocatedFromStockLevel } from './shelf-stock-service';
import { applyPhysicalShelfCount } from './inventory-guardian-action-service';
import type { PickerShelfInfo, WaitingOrder } from '@/types/inventory-guardian.types';

/*
 * Picker shelf guard (owner rule 2026-10-31, docs/BUSINESS_WORKFLOW.md
 * "Picking when the shelf says there's not enough").
 *
 *   - A picker can't tap Found for more than unallocated stock without counting
 *     the Unit 1 shelf; the count is saved like a Guardian count.
 *   - A picker can't borrow while unallocated stock is above 0 until they
 *     confirm Unit 1 and Unit 2 are both empty (saved as a count of 0).
 *
 * Unallocated stock (LOCKED formula) covers both units. Unit 2 reserve has no
 * orders against it, so its share is simply its stock; the picker counts Unit 1
 * and Unit 2 is kept as recorded.
 *
 * Unit 2 can't hold more than the whole shelf. Orders take stock off Unit 1's
 * number, so when pieces were picked from Unit 2 its number stayed up (found
 * 2026-11-07: 329 products). Pickers are shown at most the shelf total, and
 * after each pick the extra is moved to Unit 1 (syncUnit2AfterPick).
 */

export type ShelfInfo = PickerShelfInfo;

async function warehouseId(supabase: SupabaseClient, code: 'UNIT1' | 'UNIT2'): Promise<string | null> {
  const { data } = await supabase.from('warehouses').select('id').eq('code', code).maybeSingle();
  return data?.id || null;
}

/** Unit 2's stock as stored (may be more than the shelf total). */
async function unit2Stock(supabase: SupabaseClient, productIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (productIds.length === 0) return map;
  const wh = { id: await warehouseId(supabase, 'UNIT2') };
  if (!wh.id) return map;
  const { data } = await supabase
    .from('product_warehouse_stock').select('product_id, stock_level').eq('warehouse_id', wh.id).in('product_id', productIds);
  (data || []).forEach((r: any) => map.set(r.product_id, Math.max(0, Number(r.stock_level) || 0)));
  return map;
}

/** Shelf numbers for the products on one order (a handful, so per-product queries are fine). */
export async function getShelfForProducts(supabase: SupabaseClient, productIds: string[]): Promise<Record<string, ShelfInfo>> {
  const ids = Array.from(new Set(productIds.filter(Boolean))).slice(0, 60);
  const [{ data: products }, u2] = await Promise.all([
    supabase.from('products').select('id, stock_level').in('id', ids),
    unit2Stock(supabase, ids),
  ]);
  const out: Record<string, ShelfInfo> = {};
  await Promise.all((products || []).map(async (p: any) => {
    const unpicked = await getUnpickedQtyForProduct(supabase, p.id);
    const unallocated = unallocatedFromStockLevel(p.stock_level, unpicked.qty);
    // Unit 2 is part of the shelf total, so it can't be more than it.
    out[p.id] = { unallocated, unit2: Math.min(u2.get(p.id) || 0, unallocated) };
  }));
  return out;
}

/**
 * Pieces of each product this order has already taken off the shelf, from the
 * database's own rules (shelf_order_targets, same as the shelf-stock trigger).
 * On a re-pick of a Picked (with issue) order only the OS pieces still need the shelf.
 */
export async function getOrderPickedQty(supabase: SupabaseClient, orderId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('shelf_order_targets', { p_order_id: orderId });
  if (error) throw error;
  const out: Record<string, number> = {};
  (data || []).forEach((r: any) => { out[r.product_id] = Number(r.qty) || 0; });
  return out;
}

/** Products with a recorded purchase still waiting on Receiving (not counted in yet). */
export async function getProductsWithPendingDelivery(supabase: SupabaseClient, productIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (productIds.length === 0) return out;
  const { data } = await supabase
    .from('purchase_order_items')
    .select('product_id, expected_qty, received_qty, purchase_orders!inner(notes)')
    .eq('status', 'pending_receipt')
    .in('product_id', productIds);
  (data || []).forEach((r: any) => {
    const po = Array.isArray(r.purchase_orders) ? r.purchase_orders[0] : r.purchase_orders;
    if (po?.notes !== 'STAFF_DRAFT' && Number(r.expected_qty) - Number(r.received_qty || 0) > 0) out.add(r.product_id);
  });
  return out;
}

export interface RecentPickerCount { at: string; unit1: number | null; byName: string | null }

/**
 * The latest count a picker saved for each product in the last `hours` hours.
 * Receiving warns about these: if the counted pieces came from the delivery
 * being received, receiving them again would count them twice.
 */
export async function getRecentPickerCounts(supabase: SupabaseClient, productIds: string[], hours = 48): Promise<Map<string, RecentPickerCount>> {
  const out = new Map<string, RecentPickerCount>();
  if (productIds.length === 0) return out;
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from('inventory_movements')
    .select('product_id, timestamp, reason')
    .in('product_id', productIds)
    .gte('timestamp', since)
    .ilike('reason', '%Counted by picker%')
    .order('timestamp', { ascending: false });
  (data || []).forEach((m: any) => {
    if (out.has(m.product_id)) return;
    const reason = String(m.reason || '');
    const unit1 = reason.match(/Unit 1 (\d+)/);
    const by = reason.match(/Counted by picker (.+?) while picking/);
    out.set(m.product_id, { at: m.timestamp, unit1: unit1 ? Number(unit1[1]) : null, byName: by ? by[1] : null });
  });
  return out;
}

async function notifyOwners(supabase: SupabaseClient, title: string, message: string) {
  const { data, error } = await supabase.rpc('get_all_users');
  if (error) return;
  const names = Array.from(new Set(
    (data || [])
      .filter((u: any) => {
        const meta = u.raw_user_meta_data || {};
        const roles: string[] = Array.isArray(meta.roles) ? meta.roles : meta.role ? [meta.role] : [];
        return roles.some((r) => ['owner', 'admin'].includes(String(r).toLowerCase()));
      })
      .map((u: any) => `${u.raw_user_meta_data?.first_name || ''} ${u.raw_user_meta_data?.last_name || ''}`.trim())
      .filter(Boolean)
  ));
  if (names.length === 0) return;
  await supabase.from('notifications').insert(names.map((name) => ({
    sales_person_name: name,
    title,
    message: message.length > 240 ? `${message.slice(0, 237)}...` : message,
    link: '/dashboard/inventory/purchases-receipts',
    is_read: false,
  })));
}

/** The picker found Unit 2 empty: zero its row (the totals trigger updates stock_level) and log it. */
async function zeroUnit2(supabase: SupabaseClient, productId: string, why: string, actorName: string) {
  const wh = { id: await warehouseId(supabase, 'UNIT2') };
  if (!wh.id) return;
  // The stored number, not the one shown to the picker (that one is capped at the shelf total).
  const was = (await unit2Stock(supabase, [productId])).get(productId) || 0;
  if (was <= 0) return;
  await supabase.from('product_warehouse_stock').update({ stock_level: 0 }).eq('product_id', productId).eq('warehouse_id', wh.id);
  await supabase.from('inventory_movements').insert({
    product_id: productId,
    quantity_change: -was,
    movement_type: 'adjustment',
    warehouse_id: wh.id,
    timestamp: new Date().toISOString(),
    reason: `${why}: empty (was ${was}). ${actorName}`,
    performed_by_name: actorName,
  });
}

/**
 * Saves a count made while picking. `unit1Count` = pieces on the Unit 1 shelf
 * including the ones in the picker's hand; Unit 2 is kept as recorded, unless
 * `unit2Empty` (the picker tapped OS and checked Unit 2 too: it is zeroed).
 * `bothEmpty` = the picker checked Unit 1 and Unit 2 before borrowing: Unit 2 is
 * zeroed too and the count is 0.
 */
export async function savePickerShelfCount(
  supabase: SupabaseClient,
  input: { productId: string; unit1Count?: number; bothEmpty?: boolean; unit2Empty?: boolean; orderId?: string | null; actorName: string }
): Promise<{ before: number; after: number }> {
  const { productId, actorName } = input;
  const orderTag = input.orderId ? ` #${input.orderId.slice(0, 8).toUpperCase()}` : '';
  const before = (await getShelfForProducts(supabase, [productId]))[productId];
  if (!before) throw new Error('Product not found');

  let total: number;
  let note: string;
  if (input.bothEmpty) {
    await zeroUnit2(supabase, productId, `Picker checked Unit 2 before borrowing${orderTag}`, actorName);
    total = 0;
    note = `Picker checked Unit 1 and Unit 2 before borrowing${orderTag}: both empty.`;
  } else {
    const n = Math.round(Number(input.unit1Count));
    if (!(n >= 0) || n > 100000) throw new Error('Enter how many are on the shelf.');
    if (input.unit2Empty) {
      // Tapped OS: the system said there should be some, the picker looked in both units.
      await zeroUnit2(supabase, productId, `Picker checked Unit 2 after tapping OS${orderTag}`, actorName);
      total = n;
      note = `Counted by picker ${actorName} while picking${orderTag} (tapped OS): Unit 1 ${n}, Unit 2 empty${before.unit2 ? ` (was ${before.unit2})` : ''}.`;
    } else {
      total = n + before.unit2;
      note = `Counted by picker ${actorName} while picking${orderTag}: Unit 1 ${n}${before.unit2 ? ` + Unit 2 ${before.unit2} (kept)` : ''}.`;
    }
  }
  await applyPhysicalShelfCount(supabase, { productId, physicalShelfCount: total, notes: note, actorName });

  if (total > before.unallocated) {
    const { data: p } = await supabase.from('products').select('name').eq('id', productId).maybeSingle();
    await notifyOwners(supabase, 'Picker found more than the system expected',
      `${p?.name || 'An item'}: ${actorName} counted ${total} while picking${orderTag}; the system expected ${before.unallocated}. A purchase may not be recorded.`);
  }
  return { before: before.unallocated, after: total };
}

/** Order statuses a picker still picks for (a lay-away still being paid isn't picked yet). */
const WAITING_STATUSES = ['Processing', 'Waiting for Stock'];

/**
 * Other open orders that still need this product, and how many (bundles count by
 * recipe; a Picked (with issue) order needs what was marked OS). Used when a picker
 * found fewer pieces than the order needs: the pieces may finish another order.
 */
export async function getOrdersWaitingFor(
  supabase: SupabaseClient,
  productId: string,
  excludeOrderId: string | null
): Promise<WaitingOrder[]> {
  const qtyPerUnit = await bundleQtyPerUnit(supabase, productId);
  const orderCols = 'orders!inner(status, created_at, customers(full_name))';
  const [linesRes, issuesRes] = await Promise.all([
    supabase
      .from('order_items')
      .select(`order_id, product_id, quantity, is_packed, ${orderCols}`)
      .in('product_id', Array.from(qtyPerUnit.keys()))
      .in('orders.status', WAITING_STATUSES),
    supabase
      .from('order_issues')
      .select(`order_id, out_of_stock_qty, ${orderCols}`)
      .eq('product_id', productId)
      .eq('status', 'open')
      .eq('orders.status', PICKED_WITH_ISSUE),
  ]);
  if (linesRes.error) throw linesRes.error;
  if (issuesRes.error) throw issuesRes.error;

  const byOrder = new Map<string, WaitingOrder>();
  const add = (row: any, qty: number, mode: 'sum' | 'max') => {
    const id = String(row.order_id || '');
    if (!id || id === excludeOrderId || qty <= 0) return;
    const o = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    const c = Array.isArray(o?.customers) ? o.customers[0] : o?.customers;
    const cur = byOrder.get(id);
    if (cur) cur.need = mode === 'sum' ? cur.need + qty : Math.max(cur.need, qty);
    else byOrder.set(id, { orderId: id, customerName: c?.full_name || 'Customer', need: qty, status: String(o?.status || ''), createdAt: String(o?.created_at || '') });
  };
  for (const r of linesRes.data || []) {
    if (r.is_packed) continue;
    add(r, (Number(r.quantity) || 1) * (qtyPerUnit.get(r.product_id) || 1), 'sum');
  }
  // OS issues: the largest open one per order (same rule as the unpicked count).
  for (const i of issuesRes.data || []) add(i, Number(i.out_of_stock_qty) || 1, 'max');
  return Array.from(byOrder.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * After a pick: Unit 2 can't hold more than the whole shelf. If it does, the
 * pieces were taken from Unit 2, so the extra is moved to Unit 1 (a transfer:
 * the product's total doesn't change). Returns how many pieces were moved.
 */
export async function syncUnit2AfterPick(
  supabase: SupabaseClient,
  productIds: string[],
  orderId: string | null,
  actorName: string
): Promise<number> {
  const ids = Array.from(new Set(productIds.filter(Boolean))).slice(0, 60);
  const [u1, u2] = await Promise.all([warehouseId(supabase, 'UNIT1'), warehouseId(supabase, 'UNIT2')]);
  if (!u1 || !u2 || ids.length === 0) return 0;
  const [stored, shelf] = await Promise.all([unit2Stock(supabase, ids), getShelfForProducts(supabase, ids)]);
  const items = ids
    .filter((id) => shelf[id])
    .map((id) => ({ productId: id, quantity: (stored.get(id) || 0) - shelf[id].unallocated }))
    .filter((i) => i.quantity > 0);
  if (items.length === 0) return 0;
  const orderTag = orderId ? ` #${orderId.slice(0, 8).toUpperCase()}` : '';
  const { error } = await supabase.rpc('execute_stock_transfer', {
    p_from_warehouse_id: u2,
    p_to_warehouse_id: u1,
    p_items: items,
    p_notes: `Picked from Unit 2${orderTag}: Unit 2 was recorded with more than the whole shelf`,
    p_created_by: actorName,
  });
  if (error) throw error;
  return items.reduce((s, i) => s + i.quantity, 0);
}
