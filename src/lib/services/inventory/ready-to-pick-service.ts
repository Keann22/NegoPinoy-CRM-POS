import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages, layawayItemsPaid } from '../procurement-demand-service';
import { getUnpickedQtyMap, shelfNumberOf } from './shelf-stock-service';
import type { ReadyToPickItem, ReadyToPickOrder, ReadyToPickResponse } from '@/types/ready-to-pick.types';

const MIN_LAYAWAY_PAID_RATIO = 0.9;
const CHUNK = 200;

type RecipeComp = { componentId: string; qtyPerBundle: number };

function parseRecipe(recipe: unknown): RecipeComp[] {
  if (!Array.isArray(recipe)) return [];
  return recipe
    .map((c: any) => ({
      componentId: String(c?.productId || c?.component_id || ''),
      qtyPerBundle: Math.max(1, Number(c?.quantity) || 1),
    }))
    .filter((c) => c.componentId.length > 0);
}

function productLabel(p: { name?: string | null; variant_name?: string | null } | undefined): string {
  if (!p?.name) return 'Unknown item';
  return p.variant_name && !p.name.includes(p.variant_name) ? `${p.name} [${p.variant_name}]` : p.name;
}

function paidRatioOf(o: any): number {
  const total = Number(o.total_amount || 0);
  if (total <= 0) return 0;
  return Number(o.amount_paid || 0) / total;
}

function isOrderPaid(o: any): boolean {
  if (o.balance_due != null && Number(o.balance_due) < 1) return true;
  return o.payment_method === 'Lay-away' && layawayItemsPaid(o);
}

function isEligibleOrder(o: any): boolean {
  if (o.payment_method !== 'Lay-away') return true;
  if (isOrderPaid(o)) return true;
  return paidRatioOf(o) >= MIN_LAYAWAY_PAID_RATIO;
}

async function fetchInChunks<T>(ids: string[], run: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    out.push(...(await run(ids.slice(i, i + CHUNK))));
  }
  return out;
}

/**
 * Live list of Picked (with issue) and Processing orders that can truly be
 * completely picked right now using physical warehouse shelf stock.
 *
 * Rules:
 * - Excludes On-Hold orders and Lay-aways under 90% paid.
 * - Uses products.shelf_stock via shelfNumberOf() (fallback: locked formula).
 * - Expands bundle/set products into their component SKUs.
 * - Allocates scarce shelf stock Paid-first, then oldest-first, so two orders
 *   never double-count the same last piece on the shelf.
 * - Never includes supplier names or cost prices (safe for staff screens).
 */
export async function getReadyToPickOrders(supabase: SupabaseClient): Promise<ReadyToPickResponse> {
  const orders = await fetchAllPages<any>((from, to) =>
    supabase
      .from('orders')
      .select('id, status, order_date, created_at, payment_method, total_amount, subtotal, total_discount, amount_paid, balance_due, sales_person_name, notes, customers(full_name)')
      .in('status', ['Picked (with issue)', 'Processing'])
      .order('id')
      .range(from, to)
  );

  const eligible = orders.filter(isEligibleOrder);
  if (eligible.length === 0) {
    return { generatedAt: new Date().toISOString(), pickedWithIssue: [], processing: [], contendedCount: 0 };
  }

  const pwiIds = eligible.filter((o) => o.status === 'Picked (with issue)').map((o) => o.id as string);
  const procIds = eligible.filter((o) => o.status === 'Processing').map((o) => o.id as string);

  const [openIssues, procLines] = await Promise.all([
    fetchInChunks(pwiIds, (chunk) =>
      fetchAllPages<any>((from, to) =>
        supabase
          .from('order_issues')
          .select('id, order_id, product_id, out_of_stock_qty')
          .eq('status', 'open')
          .not('product_id', 'is', null)
          .in('order_id', chunk)
          .order('id')
          .range(from, to)
      )
    ),
    fetchInChunks(procIds, (chunk) =>
      fetchAllPages<any>((from, to) =>
        supabase
          .from('order_items')
          .select('id, order_id, product_id, quantity, is_packed')
          .in('order_id', chunk)
          .order('id')
          .range(from, to)
      )
    ),
  ]);

  // Picked (with issue) orders with no open order_issues: check their unpacked order_items instead.
  const pwiWithIssues = new Set(openIssues.map((i) => String(i.order_id)));
  const pwiNoIssueIds = pwiIds.filter((id) => !pwiWithIssues.has(id));
  const pwiFallbackLines = pwiNoIssueIds.length > 0
    ? await fetchInChunks(pwiNoIssueIds, (chunk) =>
        fetchAllPages<any>((from, to) =>
          supabase
            .from('order_items')
            .select('id, order_id, product_id, quantity, is_packed')
            .in('order_id', chunk)
            .order('id')
            .range(from, to)
        )
      )
    : [];

  // Deduplicate open issues per order + product (same rule as shelf-stock-service).
  const maxIssueByKey = new Map<string, { orderId: string; productId: string; qty: number }>();
  for (const i of openIssues) {
    const key = `${i.order_id}::${i.product_id}`;
    const qty = Math.max(1, Number(i.out_of_stock_qty) || 1);
    const cur = maxIssueByKey.get(key);
    if (!cur || qty > cur.qty) maxIssueByKey.set(key, { orderId: String(i.order_id), productId: String(i.product_id), qty });
  }

  // Raw needed lines per order before bundle expansion.
  const rawByOrder = new Map<string, { productId: string; qty: number }[]>();
  const addRaw = (orderId: string, productId: string | null, qty: number) => {
    if (!productId || qty <= 0) return;
    const list = rawByOrder.get(orderId) || [];
    list.push({ productId, qty });
    rawByOrder.set(orderId, list);
  };

  maxIssueByKey.forEach((v) => addRaw(v.orderId, v.productId, v.qty));
  for (const row of [...procLines, ...pwiFallbackLines]) {
    if (row.is_packed) continue;
    addRaw(String(row.order_id), row.product_id ? String(row.product_id) : null, Math.max(1, Number(row.quantity) || 1));
  }

  const initialProductIds = Array.from(
    new Set(Array.from(rawByOrder.values()).flat().map((r) => r.productId))
  );
  if (initialProductIds.length === 0) {
    return { generatedAt: new Date().toISOString(), pickedWithIssue: [], processing: [], contendedCount: 0 };
  }

  const initialProducts = await fetchInChunks(initialProductIds, (chunk) =>
    fetchAllPages<any>((from, to) =>
      supabase
        .from('products')
        .select('id, name, variant_name, shelf_stock, stock_level, shelf_location, assembly_recipe')
        .in('id', chunk)
        .order('id')
        .range(from, to)
    )
  );

  const productMap = new Map<string, any>(initialProducts.map((p) => [String(p.id), p]));
  const missingCompIds = new Set<string>();
  for (const p of initialProducts) {
    for (const c of parseRecipe(p.assembly_recipe)) {
      if (!productMap.has(c.componentId)) missingCompIds.add(c.componentId);
    }
  }
  if (missingCompIds.size > 0) {
    const compProducts = await fetchInChunks(Array.from(missingCompIds), (chunk) =>
      fetchAllPages<any>((from, to) =>
        supabase
          .from('products')
          .select('id, name, variant_name, shelf_stock, stock_level, shelf_location, assembly_recipe')
          .in('id', chunk)
          .order('id')
          .range(from, to)
      )
    );
    compProducts.forEach((p) => productMap.set(String(p.id), p));
  }

  // Only compute fallback unpicked map if any referenced product has null shelf_stock.
  const needsFallback = Array.from(productMap.values()).some(
    (p) => p.shelf_stock == null && parseRecipe(p.assembly_recipe).length === 0
  );
  const unpickedMap = needsFallback ? await getUnpickedQtyMap(supabase) : new Map<string, number>();

  const shelfOf = (productId: string): number => {
    const p = productMap.get(productId);
    if (!p) return 0;
    return shelfNumberOf(p, unpickedMap.get(productId) || 0);
  };

  // Expand bundles and keep only orders where every needed item is individually available on the shelf.
  const candidates: ReadyToPickOrder[] = [];
  for (const o of eligible) {
    const rawLines = rawByOrder.get(String(o.id)) || [];
    if (rawLines.length === 0) continue;

    const neededMap = new Map<string, number>();
    for (const line of rawLines) {
      const prod = productMap.get(line.productId);
      const recipe = parseRecipe(prod?.assembly_recipe);
      if (recipe.length > 0) {
        for (const comp of recipe) {
          neededMap.set(comp.componentId, (neededMap.get(comp.componentId) || 0) + line.qty * comp.qtyPerBundle);
        }
      } else {
        neededMap.set(line.productId, (neededMap.get(line.productId) || 0) + line.qty);
      }
    }

    const items: ReadyToPickItem[] = [];
    let allAvailable = true;
    for (const [productId, neededQty] of neededMap.entries()) {
      const shelfStock = shelfOf(productId);
      if (shelfStock < neededQty) {
        allAvailable = false;
        break;
      }
      const p = productMap.get(productId);
      items.push({
        productId,
        name: productLabel(p),
        neededQty,
        shelfStock,
        shelfLocation: p?.shelf_location ? String(p.shelf_location) : null,
      });
    }
    if (!allAvailable || items.length === 0) continue;

    items.sort((a, b) => a.name.localeCompare(b.name));
    const customer = Array.isArray(o.customers) ? o.customers[0] : o.customers;
    candidates.push({
      id: String(o.id),
      orderNo: String(o.id).slice(0, 7).toUpperCase(),
      status: o.status,
      orderDate: String(o.order_date || o.created_at),
      customerName: String(customer?.full_name || 'Unknown').replace(/\s+/g, ' ').trim(),
      paymentMethod: String(o.payment_method || ''),
      isPaid: isOrderPaid(o),
      paidPercent: Math.min(100, Math.round(paidRatioOf(o) * 100)),
      salesPersonName: o.sales_person_name ? String(o.sales_person_name) : null,
      notes: o.notes ? String(o.notes).trim() || null : null,
      noOpenIssue: o.status === 'Picked (with issue)' && !pwiWithIssues.has(String(o.id)),
      items,
    });
  }

  // Allocate scarce shelf stock: Paid first, then oldest order date first.
  candidates.sort((a, b) => {
    if (a.isPaid !== b.isPaid) return a.isPaid ? -1 : 1;
    const dateCmp = a.orderDate.localeCompare(b.orderDate);
    return dateCmp !== 0 ? dateCmp : a.orderNo.localeCompare(b.orderNo);
  });

  const remaining = new Map<string, number>();
  const fillable: ReadyToPickOrder[] = [];
  let contendedCount = 0;

  for (const order of candidates) {
    const canFill = order.items.every((item) => {
      const left = remaining.has(item.productId) ? remaining.get(item.productId)! : item.shelfStock;
      return left >= item.neededQty;
    });
    if (canFill) {
      for (const item of order.items) {
        const left = remaining.has(item.productId) ? remaining.get(item.productId)! : item.shelfStock;
        remaining.set(item.productId, left - item.neededQty);
      }
      fillable.push(order);
    } else {
      contendedCount += 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    pickedWithIssue: fillable.filter((o) => o.status === 'Picked (with issue)'),
    processing: fillable.filter((o) => o.status === 'Processing'),
    contendedCount,
  };
}
