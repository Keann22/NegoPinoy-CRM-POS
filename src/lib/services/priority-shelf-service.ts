import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from './procurement-demand-service';
import { getUnpickedQtyMap, shelfNumberOf, PICKED_WITH_ISSUE } from './inventory/shelf-stock-service';
import { findStage } from '@/lib/online-order-tracking';
import { allocateShelf, type CoverageOrder } from '@/lib/priority/shelf-coverage';
import { PRIORITY_RULES, transitState, type MissingItem } from '@/lib/priority/priority-rules';

/**
 * Items the shelf can't cover on orders not picked yet, for the Priority List.
 * Without this an order counted as Ready to pack until a picker reported an
 * item OS (found 2026-11-26: 60 of 180 Ready to pack orders were short).
 */

/** Not picked yet and waiting to be picked. On-Hold orders don't take shelf pieces. */
const POOL_STATUSES = ['Pending Payment', 'Processing', 'Waiting for Stock'];
const CHUNK = 150;
const DAY = 24 * 60 * 60 * 1000;

export interface ShelfPoolOrder {
  id: string;
  status: string;
  paid: boolean;
  orderDate: string;
  /** Ships later and not picked until 3 days before: its pieces stay free. */
  pickDeferred: boolean;
}

export interface ShelfPoolLine {
  order_id: string;
  product_id: string | null;
  quantity?: number | null;
  is_packed?: boolean | null;
  products?: ShelfProduct | null;
}

export interface ShelfPoolIssue {
  order_id: string;
  product_id: string | null;
  status: string;
  out_of_stock_qty?: number | null;
}

interface ShelfProduct {
  id?: string;
  name?: string | null;
  variant_name?: string | null;
  shelf_stock?: number | null;
  stock_level?: number | null;
  assembly_recipe?: unknown;
}

interface Incoming {
  qty: number;
  boughtAt: string;
  eta: string;
  stageLabel: string | null;
}

export interface ShelfShortage {
  productId: string;
  name: string;
  qty: number;
  onShelf: number;
  /** Earliest purchase on the way, when one covers the short pieces. */
  incoming: Incoming | null;
}

function recipeOf(recipe: unknown): { id: string; qty: number }[] {
  if (!Array.isArray(recipe)) return [];
  return recipe
    .map((c: any) => ({ id: String(c?.productId || c?.component_id || ''), qty: Math.max(1, Number(c?.quantity) || 1) }))
    .filter((c) => c.id.length > 0);
}

function label(p: ShelfProduct | undefined): string {
  if (!p?.name) return 'Unknown item';
  return p.variant_name && !String(p.name).includes(p.variant_name) ? `${p.name} [${p.variant_name}]` : String(p.name);
}

async function inChunks<T>(ids: string[], run: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await run(ids.slice(i, i + CHUNK))));
  return out;
}

async function loadProducts(supabase: SupabaseClient, ids: string[]): Promise<ShelfProduct[]> {
  return inChunks(ids, (c) => fetchAllPages<ShelfProduct>((f, t) =>
    supabase.from('products').select('id, name, variant_name, shelf_stock, stock_level, assembly_recipe').in('id', c).order('id').range(f, t)));
}

/** Bought and not received yet, per product (shopping-list requests don't count). */
async function loadIncoming(supabase: SupabaseClient, productIds: string[]): Promise<Map<string, Incoming>> {
  const rows = await inChunks(productIds, (c) => fetchAllPages<any>((f, t) =>
    supabase.from('purchase_order_items')
      .select('id, product_id, expected_qty, received_qty, created_at, purchase_orders!inner(notes, created_at, expected_arrival, tracking_route, tracking_stage)')
      .in('product_id', c)
      .eq('status', 'pending_receipt')
      .or('notes.is.null,notes.neq.STAFF_DRAFT', { foreignTable: 'purchase_orders' })
      .order('id').range(f, t)));
  const out = new Map<string, Incoming>();
  for (const r of rows) {
    const qty = Math.max(0, Number(r.expected_qty || 0) - Number(r.received_qty || 0));
    if (qty <= 0) continue;
    const po = Array.isArray(r.purchase_orders) ? r.purchase_orders[0] : r.purchase_orders || {};
    const boughtAt = po.created_at || r.created_at;
    const eta = po.expected_arrival || new Date(new Date(boughtAt).getTime() + PRIORITY_RULES.untrackedTransitDays * DAY).toISOString();
    const prev = out.get(r.product_id);
    const stageLabel = findStage(po.tracking_route, po.tracking_stage)?.label || null;
    if (!prev) out.set(r.product_id, { qty, boughtAt, eta, stageLabel });
    else out.set(r.product_id, eta < prev.eta ? { qty: prev.qty + qty, boughtAt, eta, stageLabel } : { ...prev, qty: prev.qty + qty });
  }
  return out;
}

/** Short items per order (orders the shelf covers aren't in the map). */
export async function getShelfShortages(
  supabase: SupabaseClient,
  orders: ShelfPoolOrder[],
  lines: ShelfPoolLine[],
  issues: ShelfPoolIssue[]
): Promise<Map<string, ShelfShortage[]>> {
  const pool = orders.filter((o) => !o.pickDeferred && (POOL_STATUSES.includes(o.status) || o.status === PICKED_WITH_ISSUE));
  if (pool.length === 0) return new Map();
  const poolIds = new Set(pool.map((o) => o.id));
  const statusOf = new Map(pool.map((o) => [o.id, o.status]));

  const products = new Map<string, ShelfProduct>();
  lines.forEach((l) => { if (l.product_id && l.products) products.set(l.product_id, { ...l.products, id: l.product_id }); });

  // What each order still needs from the shelf: unpicked lines, or the OS
  // pieces of a Picked (with issue) order (largest open report per product).
  const raw = new Map<string, Map<string, number>>();
  const add = (orderId: string, productId: string, qty: number) => {
    const m = raw.get(orderId) || new Map<string, number>();
    m.set(productId, (m.get(productId) || 0) + qty);
    raw.set(orderId, m);
  };
  for (const l of lines) {
    if (!poolIds.has(l.order_id) || statusOf.get(l.order_id) === PICKED_WITH_ISSUE || !l.product_id || l.is_packed) continue;
    add(l.order_id, l.product_id, Math.max(1, Number(l.quantity) || 1));
  }
  const osMax = new Map<string, { orderId: string; productId: string; qty: number }>();
  for (const i of issues) {
    if (i.status !== 'open' || !i.product_id || statusOf.get(i.order_id) !== PICKED_WITH_ISSUE) continue;
    const key = `${i.order_id}::${i.product_id}`;
    const qty = Math.max(1, Number(i.out_of_stock_qty) || 1);
    if ((osMax.get(key)?.qty || 0) < qty) osMax.set(key, { orderId: i.order_id, productId: i.product_id, qty });
  }
  osMax.forEach((v) => add(v.orderId, v.productId, v.qty));

  // OS reports can name products that aren't on the fetched lines; sets need their parts.
  const missingIds = Array.from(new Set(Array.from(raw.values()).flatMap((m) => Array.from(m.keys())))).filter((id) => !products.has(id));
  (await loadProducts(supabase, missingIds)).forEach((p) => products.set(String(p.id), p));
  const partIds = Array.from(new Set(Array.from(products.values()).flatMap((p) => recipeOf(p.assembly_recipe).map((c) => c.id)))).filter((id) => !products.has(id));
  (await loadProducts(supabase, partIds)).forEach((p) => products.set(String(p.id), p));

  const coverage: CoverageOrder[] = pool.map((o) => {
    const needs = new Map<string, number>();
    (raw.get(o.id) || new Map<string, number>()).forEach((qty, productId) => {
      const parts = recipeOf(products.get(productId)?.assembly_recipe);
      if (parts.length) parts.forEach((c) => needs.set(c.id, (needs.get(c.id) || 0) + qty * c.qty));
      else needs.set(productId, (needs.get(productId) || 0) + qty);
    });
    return { id: o.id, paid: o.paid, orderDate: o.orderDate, needs };
  });

  // Stored shelf number; the locked formula only for products without one.
  const needIds = Array.from(new Set(coverage.flatMap((o) => Array.from(o.needs.keys()))));
  const unpicked = needIds.some((id) => products.get(id)?.shelf_stock == null) ? await getUnpickedQtyMap(supabase) : new Map<string, number>();
  const shelfOf = (id: string) => shelfNumberOf(products.get(id) || {}, unpicked.get(id) || 0);

  // First pass without purchases, to know which products need them.
  const firstPass = allocateShelf(coverage, shelfOf, () => 0);
  const shortIds = Array.from(new Set(Array.from(firstPass.values()).flatMap((items) => items.map((i) => i.productId))));
  const incoming = shortIds.length ? await loadIncoming(supabase, shortIds) : new Map<string, Incoming>();
  const result = allocateShelf(coverage, shelfOf, (id) => incoming.get(id)?.qty || 0);

  const out = new Map<string, ShelfShortage[]>();
  result.forEach((items, orderId) => out.set(orderId, items.map((i) => ({
    productId: i.productId,
    name: label(products.get(i.productId)),
    qty: i.qty,
    onShelf: i.onShelf,
    incoming: i.incoming ? incoming.get(i.productId) || null : null,
  }))));
  return out;
}

/** A shelf shortage as a Priority List item: on the way, or not on the shelf. */
export function shortageToMissing(s: ShelfShortage, since: string, now: Date): MissingItem {
  const base = { productId: s.productId, name: s.name, qty: s.qty, onShelf: s.onShelf, decision: null, borrowedFor: null };
  if (s.incoming) {
    return { ...base, state: transitState(s.incoming.eta, now), since: s.incoming.boughtAt, eta: s.incoming.eta, stageLabel: s.incoming.stageLabel };
  }
  return { ...base, state: 'not_on_shelf', since, eta: null, stageLabel: null };
}
