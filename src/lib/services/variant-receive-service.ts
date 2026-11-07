import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A product with variants (e.g. "Sdd8 table runner" with TM1/TM2/TM3) is never
 * sold directly: orders always use a variant. Receipts often name only the
 * product ("17 x SDD-8"), so a purchase can be recorded on the parent. If it is
 * received there, the stock sits on the parent while the variants the orders
 * need stay at zero (found 2026-11-07: 23 table runners on the parent, TM2 at
 * 0, so the picker couldn't pick it). So Receiving asks how many of each
 * variant arrived, and the purchase line is split onto the variants.
 */

export type VariantOption = { id: string; label: string };

// Orders that still need a piece from the shelf.
const ORDERS_WAITING_FOR_SHELF = ['Pending Payment', 'Processing', 'On-Hold', 'Waiting for Stock', 'Picked (with issue)'];

const notDeleted = (p: any) => !String(p.name || '').startsWith('[DELETED]');

// "TM1" rather than "Sdd8 table runner - TM1" (some variant_name values hold the full name).
const labelOf = (p: any, parentName: string) => {
  const name = String(p.variant_name || p.name || '');
  const short = parentName && name.startsWith(parentName)
    ? name.slice(parentName.length).replace(/^[\s\-–—:]+/, '')
    : name;
  return short || name;
};

/**
 * The variants staff can receive into, per product. Only products that have
 * variants are in the map. Two levels deep, leaves only (same as the order form).
 */
export async function leafVariantsOf(supabase: SupabaseClient, productIds: string[]) {
  const result = new Map<string, VariantOption[]>();
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  if (ids.length === 0) return result;

  const { data: parents, error: pErr } = await supabase.from('products').select('id, name').in('id', ids);
  if (pErr) throw pErr;
  const parentName = new Map((parents || []).map((p: any) => [p.id as string, String(p.name || '')]));

  const { data: level1, error: l1Err } = await supabase
    .from('products').select('id, name, variant_name, parent_id').in('parent_id', ids);
  if (l1Err) throw l1Err;
  const l1 = (level1 || []).filter(notDeleted);
  if (l1.length === 0) return result;

  const { data: level2, error: l2Err } = await supabase
    .from('products').select('id, name, variant_name, parent_id').in('parent_id', l1.map((v: any) => v.id));
  if (l2Err) throw l2Err;
  const l2 = (level2 || []).filter(notDeleted);
  const hasChildren = new Set(l2.map((v: any) => v.parent_id as string));
  const l1Parent = new Map(l1.map((v: any) => [v.id as string, v.parent_id as string]));

  const add = (rootId: string, v: any) => {
    const list = result.get(rootId) || [];
    list.push({ id: v.id, label: labelOf(v, parentName.get(rootId) || '') });
    result.set(rootId, list);
  };
  l1.filter((v: any) => !hasChildren.has(v.id)).forEach((v: any) => add(v.parent_id, v));
  l2.forEach((v: any) => add(l1Parent.get(v.parent_id)!, v));
  result.forEach((list) => list.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })));

  // Orders taken before the variants were added still wait on the main product
  // itself (e.g. 18L air fryer, 2026-11). Until they are moved to a variant, the
  // main product stays a choice, listed last.
  const roots = Array.from(result.keys());
  const { data: waiting, error: wErr } = await supabase
    .from('order_items')
    .select('product_id, orders!inner(status)')
    .in('product_id', roots)
    .in('orders.status', ORDERS_WAITING_FOR_SHELF);
  if (wErr) throw wErr;
  const ordersOn = new Map<string, number>();
  (waiting || []).forEach((w: any) => ordersOn.set(w.product_id, (ordersOn.get(w.product_id) || 0) + 1));
  ordersOn.forEach((n, rootId) => {
    result.get(rootId)!.push({ id: rootId, label: `No variant (${n} old order${n === 1 ? '' : 's'})` });
  });
  return result;
}

export type VariantCount = { productId: string; qty: number };

/**
 * Split a purchase line on a parent product onto its variants. Each variant
 * with a count gets its own line (same purchase, supplier and cost) waiting to
 * be received for exactly that count. The parent line keeps only what didn't
 * arrive (a short delivery); if everything arrived it is removed, or closed if
 * part of it had been received before.
 * Returns the new lines to receive.
 */
export async function splitLineOntoVariants(
  supabase: SupabaseClient,
  itemId: string,
  counts: VariantCount[],
  allowed: VariantOption[],
) {
  const allowedIds = new Set(allowed.map((v) => v.id));
  const clean = counts
    .map((c) => ({ productId: String(c.productId), qty: Math.round(Number(c.qty) || 0) }))
    .filter((c) => c.qty > 0);
  if (clean.length === 0) throw new Error('Enter how many of each variant arrived.');
  if (clean.some((c) => !allowedIds.has(c.productId))) throw new Error('That is not a variant of this product. Refresh the page.');

  const { data: line, error } = await supabase
    .from('purchase_order_items')
    .select('id, po_id, supplier_id, unit_cost, expected_qty, received_qty, status, requested_by_name')
    .eq('id', itemId).single();
  if (error || !line) throw new Error('Purchase line not found. Refresh the page.');
  if (line.status !== 'pending_receipt') throw new Error('This line was already received. Refresh the page.');

  const total = clean.reduce((s, c) => s + c.qty, 0);
  const expected = Number(line.expected_qty) || 0;
  const received = Number(line.received_qty) || 0;

  // Same variant twice adds up.
  const byVariant = new Map<string, number>();
  clean.forEach((c) => byVariant.set(c.productId, (byVariant.get(c.productId) || 0) + c.qty));

  const { data: created, error: insErr } = await supabase
    .from('purchase_order_items')
    .insert(Array.from(byVariant, ([productId, qty]) => ({
      po_id: line.po_id,
      product_id: productId,
      supplier_id: line.supplier_id,
      unit_cost: line.unit_cost,
      expected_qty: qty,
      received_qty: 0,
      status: 'pending_receipt',
      requested_by_name: line.requested_by_name,
    })))
    .select('id, product_id, expected_qty');
  if (insErr) throw insErr;

  const left = expected - received - total;
  if (left > 0) {
    const { error: uErr } = await supabase.from('purchase_order_items')
      .update({ expected_qty: expected - total }).eq('id', itemId);
    if (uErr) throw uErr;
  } else if (received === 0) {
    const { error: dErr } = await supabase.from('purchase_order_items').delete().eq('id', itemId);
    if (dErr) throw dErr;
  } else {
    const { error: uErr } = await supabase.from('purchase_order_items')
      .update({ expected_qty: received, status: 'received' }).eq('id', itemId);
    if (uErr) throw uErr;
  }

  return {
    lines: (created || []).map((c: any) => ({ itemId: c.id as string, qty: Number(c.expected_qty) })),
    parentLine: { po_id: line.po_id, expected, received, total },
  };
}
