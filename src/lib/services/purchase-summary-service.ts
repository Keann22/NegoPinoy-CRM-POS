import { SupabaseClient } from '@supabase/supabase-js';
import { VOID_ORDER_STATUSES, backfillOrderItemCosts } from './cost-backfill-service';
import {
  resolveSupplierName,
  suggestSupplierAndCost,
  applyProductCost,
  createBackfillPurchaseOrder,
  repairFromPurchaseItem,
} from './purchase-repair-service';

// Supplier identities and costs are management-only. Roles live in the user's
// metadata (same source the dashboard reads via useUserProfile). We check both
// app_metadata (server-controlled, preferred) and user_metadata, and default to
// deny — no session, or no recognised role, means staff-level access.
export function isManagementUser(user: any): boolean {
  const collect = (meta: any): string[] => {
    if (!meta) return [];
    if (Array.isArray(meta.roles)) return meta.roles.map((r: string) => String(r).toLowerCase().trim());
    if (meta.role) return [String(meta.role).toLowerCase().trim()];
    return [];
  };
  const roles = [...collect(user?.app_metadata), ...collect(user?.user_metadata)];
  return roles.includes('owner') || roles.includes('admin');
}

/**
 * Every recorded buy whose purchase falls inside [start, end].
 *
 * A "purchase" is any purchase_order_items row whose parent PO is not a
 * STAFF_DRAFT (drafts are staff *requests*, not recorded buys). The PO row is
 * created at the moment "Buy" is tapped, so its created_at is the true buying
 * timestamp — the item's own created_at can predate the purchase when a staff
 * draft item gets converted in place.
 *
 * NOTE: buy-flow POs have notes = null, and a plain .neq('notes',
 * 'STAFF_DRAFT') silently drops null rows (SQL null semantics), so the null
 * case must be matched explicitly.
 */
export async function fetchPurchasesInRange(supabase: SupabaseClient, start: string, end: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await supabase
      .from('purchase_order_items')
      .select(`
        id, product_id, expected_qty, received_qty, unit_cost, status, supplier_id,
        purchase_orders!inner(id, notes, created_at),
        products(name, variant_name),
        suppliers(name)
      `)
      .or('notes.is.null,notes.neq.STAFF_DRAFT', { foreignTable: 'purchase_orders' })
      .gte('purchase_orders.created_at', start)
      .lte('purchase_orders.created_at', end)
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    if (!page || page.length === 0) break;
    rows.push(...page);
    if (page.length < 1000) break;
  }

  const purchases = rows.map((r: any) => {
    const prod = r.products;
    let productName = prod?.name || 'Unknown Product';
    if (prod?.variant_name && !productName.includes(prod.variant_name)) {
      productName = `${productName} [${prod.variant_name}]`;
    }
    const qty = Number(r.expected_qty) || 0;
    const unitCost = Number(r.unit_cost) || 0;
    return {
      id: r.id,
      productId: r.product_id,
      productName,
      qty,
      receivedQty: Number(r.received_qty) || 0,
      unitCost,
      totalCost: qty * unitCost,
      supplierId: r.supplier_id,
      supplierName: r.suppliers?.name || null,
      status: r.status,
      batchName: r.purchase_orders?.notes || null,
      purchasedAt: r.purchase_orders?.created_at,
    };
  });

  purchases.sort((a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime());
  return purchases;
}

// Receiving writes this exact reason for an item staff added by hand because it
// wasn't on the pending list (see POST /api/inventory/receive/pending-pos).
const UNEXPECTED_REASON = 'Unexpected Delivery Item';
// Stamped once the receipt has been turned into a purchase, so it stops being
// listed as unrecorded.
const RECORDED_REASON = 'Unexpected Delivery Item (recorded as purchase)';
// Appended to a receipt's reason once an admin has checked the purchase that
// receiving auto-created for it against the supplier's receipt.
const CONFIRMED_SUFFIX = ' [purchase confirmed]';

const isConfirmedReason = (reason: string | null) =>
  reason === RECORDED_REASON || !!reason?.endsWith(CONFIRMED_SUFFIX);

/**
 * How each line on the "Received" comparison came to have (or not have) a
 * purchase behind it:
 *
 * - checked    - a buy was entered before the goods arrived, so bought vs
 *                received is a real comparison.
 * - auto       - nobody entered a buy. Receiving a to-order line auto-creates
 *                the purchase from whatever staff counted (see
 *                repairFromPurchaseItem), so bought always equals received and
 *                the price is a guess from history. NOT a check.
 * - confirmed  - an auto/unexpected line an admin has since checked against the
 *                supplier's receipt.
 * - unexpected - staff added it by hand; no purchase exists at all.
 * - draft      - received off the to-order sheet with no known cost, so no
 *                purchase was created; the line is still on the STAFF_DRAFT PO.
 * - pending    - bought on this day, nothing received yet.
 */
export type ReceivedKind = 'checked' | 'auto' | 'confirmed' | 'unexpected' | 'draft' | 'pending';

export type ReceivedRow = {
  key: string;
  kind: ReceivedKind;
  productId: string;
  productName: string;
  movementId: string | null;
  itemId: string | null;
  bought: number | null;
  received: number;
  unitCost: number;
  supplierId: string | null;
  supplierName: string | null;
  at: string;
};

export const NEEDS_CHECK: ReceivedKind[] = ['auto', 'unexpected', 'draft'];

const displayName = (prod: any) => {
  let name = prod?.name || 'Unknown Product';
  if (prod?.variant_name && !name.includes(prod.variant_name)) name = `${name} [${prod.variant_name}]`;
  return name;
};

/**
 * Bought vs received for one day: every receipt in [start, end] lined up
 * against the purchase it belongs to, plus that day's buys nothing has arrived
 * for yet.
 *
 * inventory_movements has no FK to purchase_order_items, so the link is by
 * product + time. A purchase auto-created at receiving sits on a PO whose
 * created_at IS the receipt's timestamp (createBackfillPurchaseOrder), which is
 * what tells an "auto" line apart from a buy somebody actually entered.
 */
export async function fetchReceivedComparison(
  supabase: SupabaseClient,
  start: string,
  end: string,
  purchases: Awaited<ReturnType<typeof fetchPurchasesInRange>>,
  withSuggestions: boolean,
): Promise<ReceivedRow[]> {
  const { data: movementRows, error } = await supabase
    .from('inventory_movements')
    .select('id, product_id, quantity_change, timestamp, reason, unit_cost, products(name, variant_name)')
    .ilike('movement_type', 'restock')
    .gte('timestamp', start)
    .lte('timestamp', end)
    .order('timestamp', { ascending: true })
    .limit(1000);
  if (error) throw error;
  const movements: any[] = movementRows || [];

  // Purchase lines these receipts could belong to. A delivery can land days
  // after the buy, so look back a month rather than only at this day.
  const productIds = Array.from(new Set(movements.map(m => m.product_id).filter(Boolean)));
  const lookback = new Date(new Date(start).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const lines: any[] = [];
  for (let i = 0; i < productIds.length; i += 100) {
    const { data: page, error: lineErr } = await supabase
      .from('purchase_order_items')
      .select('id, product_id, expected_qty, received_qty, unit_cost, supplier_id, suppliers(name), purchase_orders!inner(notes, created_at)')
      .in('product_id', productIds.slice(i, i + 100))
      .or('notes.is.null,notes.neq.STAFF_DRAFT', { foreignTable: 'purchase_orders' })
      .gte('purchase_orders.created_at', lookback)
      .lte('purchase_orders.created_at', end)
      .limit(1000);
    if (lineErr) throw lineErr;
    lines.push(...(page || []));
  }
  const poTime = (l: any) => new Date(l.purchase_orders.created_at).getTime();

  // Which purchase line (if any) each receipt belongs to.
  const lineFor = (m: any) => {
    const at = new Date(m.timestamp).getTime();
    const own = lines.filter(l => l.product_id === m.product_id);
    // Created in the same instant as this receipt = created BY this receipt.
    const born = own.find(l => Math.abs(poTime(l) - at) < 2000);
    const line = born || own.filter(l => poTime(l) <= at).sort((x, y) => poTime(y) - poTime(x))[0];
    return { born, line };
  };

  // Pre-fill supplier/cost for receipts with no purchase (management only - the
  // suggestion names a supplier and a cost). Looked up together: one at a time
  // made a busy day take 20+ seconds to open.
  const suggestions = new Map<string, Awaited<ReturnType<typeof suggestSupplierAndCost>>>();
  if (withSuggestions) {
    const orphans = movements.filter(m => m.reason === UNEXPECTED_REASON || !lineFor(m).line);
    for (let i = 0; i < orphans.length; i += 25) {
      await Promise.all(orphans.slice(i, i + 25).map(async m => {
        suggestions.set(m.id, await suggestSupplierAndCost(supabase, m.product_id, Number(m.unit_cost) || null, null));
      }));
    }
  }

  const rows: ReceivedRow[] = [];
  const seenLines = new Set<string>();

  for (const m of movements) {
    const base = {
      productId: m.product_id as string,
      productName: displayName(m.products),
      movementId: m.id as string,
      at: m.timestamp as string,
    };

    if (m.reason === UNEXPECTED_REASON) {
      const suggestion = suggestions.get(m.id);
      rows.push({
        ...base,
        key: `m-${m.id}`,
        kind: 'unexpected',
        itemId: null,
        bought: null,
        received: Number(m.quantity_change) || 0,
        unitCost: suggestion?.unitCost || 0,
        supplierId: suggestion?.supplierId || null,
        supplierName: suggestion?.supplierName || null,
      });
      continue;
    }

    const { born, line } = lineFor(m);

    if (!line) {
      const suggestion = suggestions.get(m.id);
      rows.push({
        ...base,
        key: `m-${m.id}`,
        kind: 'draft',
        itemId: null,
        bought: null,
        received: Number(m.quantity_change) || 0,
        unitCost: suggestion?.unitCost || 0,
        supplierId: suggestion?.supplierId || null,
        supplierName: suggestion?.supplierName || null,
      });
      continue;
    }

    // Several part-deliveries against one buy are one line here.
    if (seenLines.has(line.id)) continue;
    seenLines.add(line.id);

    const kind: ReceivedKind = !born ? 'checked' : isConfirmedReason(m.reason) ? 'confirmed' : 'auto';
    rows.push({
      ...base,
      key: `l-${line.id}`,
      kind,
      itemId: line.id,
      // An unchecked auto line's "bought" is just the count echoed back.
      bought: kind === 'auto' ? null : Number(line.expected_qty) || 0,
      received: Number(line.received_qty) || 0,
      unitCost: Number(line.unit_cost) || 0,
      supplierId: line.supplier_id || null,
      supplierName: line.suppliers?.name || null,
    });
  }

  // Bought this day, nothing arrived yet.
  for (const p of purchases) {
    if (seenLines.has(p.id) || p.receivedQty > 0) continue;
    rows.push({
      key: `l-${p.id}`,
      kind: 'pending',
      productId: p.productId,
      productName: p.productName,
      movementId: null,
      itemId: p.id,
      bought: p.qty,
      received: 0,
      unitCost: p.unitCost,
      supplierId: p.supplierId,
      supplierName: p.supplierName,
      at: p.purchasedAt,
    });
  }

  return rows;
}

/** Mark the receipt behind an auto-created purchase as checked by an admin. */
export async function confirmReceipt(supabase: SupabaseClient, movementId: string) {
  const { data: movement, error } = await supabase
    .from('inventory_movements')
    .select('id, reason')
    .eq('id', movementId)
    .single();
  if (error) throw error;
  if (isConfirmedReason(movement.reason)) return;
  await supabase
    .from('inventory_movements')
    .update({ reason: `${movement.reason || 'Received from PO'}${CONFIRMED_SUFFIX}` })
    .eq('id', movementId);
}

/**
 * Turn an unexpected receipt into a proper purchase: a received line on a PO
 * dated to when the goods landed, with the cost pushed everywhere a normal buy
 * puts it. Stock is NOT touched - receiving already counted these units.
 *
 * boughtQty is what the supplier's receipt says, which can differ from what
 * staff counted; the line keeps both so the shortfall/overage stays visible.
 */
async function recordUnexpectedReceipt(
  supabase: SupabaseClient,
  movementId: string,
  supplierId: string | null,
  unitCost: number,
  boughtQty: number | null = null,
) {
  if (!Number.isFinite(unitCost) || !(unitCost > 0)) {
    throw new Error('Enter the unit cost to record this as a purchase.');
  }
  if (boughtQty !== null && (!Number.isInteger(boughtQty) || boughtQty < 1)) {
    throw new Error('Bought quantity must be a whole number of at least 1.');
  }

  const { data: movement, error } = await supabase
    .from('inventory_movements')
    .select('id, product_id, quantity_change, timestamp, reason')
    .eq('id', movementId)
    .single();
  if (error) throw error;
  if (movement.reason === RECORDED_REASON) {
    throw new Error('This receipt was already recorded as a purchase.');
  }
  if (movement.reason !== UNEXPECTED_REASON) {
    return recordDraftReceipt(supabase, movement, supplierId, unitCost, boughtQty);
  }

  const qty = Number(movement.quantity_change) || 0;
  if (!(qty > 0)) throw new Error('This receipt has no quantity to record.');
  const expected = boughtQty ?? qty;

  const supplierName = await resolveSupplierName(supabase, supplierId);

  const poId = await createBackfillPurchaseOrder(supabase, movement.timestamp);
  const { error: insErr } = await supabase.from('purchase_order_items').insert({
    po_id: poId,
    product_id: movement.product_id,
    supplier_id: supplierId || null,
    expected_qty: expected,
    received_qty: qty,
    unit_cost: unitCost,
    status: qty >= expected ? 'received' : 'pending_receipt',
  });
  if (insErr) {
    await supabase.from('purchase_orders').delete().eq('id', poId);
    throw insErr;
  }

  await supabase
    .from('inventory_movements')
    .update({ unit_cost: unitCost, supplier_name: supplierName, reason: RECORDED_REASON })
    .eq('id', movementId);

  await applyProductCost(supabase, movement.product_id, unitCost, supplierId, supplierName);
  if (supplierId) {
    await supabase.from('products').update({ supplier_id: supplierId }).eq('id', movement.product_id);
  }
  await backfillOrderItemCosts(supabase, movement.product_id, expected, unitCost);
}

/**
 * Record a receipt that has no purchase behind it - either an "unexpected"
 * hand-added item, or a to-order (STAFF_DRAFT) line received before anyone knew
 * its price.
 */
export const recordReceiptAsPurchase = recordUnexpectedReceipt;

/**
 * The to-order case. The received line is still sitting on the STAFF_DRAFT PO,
 * so this is the same repair the Purchases report banner runs
 * (repairFromPurchaseItem moves it onto a real PO dated to the receipt and
 * pushes the cost everywhere), followed by the bought-vs-received correction.
 */
async function recordDraftReceipt(
  supabase: SupabaseClient,
  movement: { id: string; product_id: string; timestamp: string; reason: string | null },
  supplierId: string | null,
  unitCost: number,
  boughtQty: number | null,
) {
  if (isConfirmedReason(movement.reason)) {
    throw new Error('This receipt was already recorded as a purchase.');
  }

  const { data: drafts, error } = await supabase
    .from('purchase_order_items')
    .select('id, purchase_orders!inner(notes)')
    .eq('product_id', movement.product_id)
    .eq('purchase_orders.notes', 'STAFF_DRAFT')
    .gt('received_qty', 0)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!drafts || drafts.length === 0) {
    throw new Error('Could not find the staff request this was received against. Record it from Reports → Purchases instead.');
  }

  await repairFromPurchaseItem(supabase, drafts[0].id, supplierId, unitCost, null, movement.timestamp);

  if (boughtQty !== null) {
    // The repaired line now sits on a PO created at the receipt's timestamp.
    const { data: moved } = await supabase
      .from('purchase_order_items')
      .select('id, expected_qty, purchase_orders!inner(notes, created_at)')
      .eq('product_id', movement.product_id)
      .eq('purchase_orders.created_at', movement.timestamp)
      .limit(1);
    if (moved && moved.length > 0 && Number(moved[0].expected_qty) !== boughtQty) {
      await editPurchaseLine(supabase, moved[0].id, { qty: boughtQty }, true);
    }
  }

  await confirmReceipt(supabase, movement.id);
}

async function loadPurchaseLine(supabase: SupabaseClient, itemId: string) {
  const { data: item, error } = await supabase
    .from('purchase_order_items')
    .select('id, po_id, product_id, expected_qty, received_qty, unit_cost, supplier_id, purchase_orders!inner(notes)')
    .eq('id', itemId)
    .single();
  if (error) throw error;
  if ((item as any).purchase_orders?.notes === 'STAFF_DRAFT') {
    throw new Error('This is a staff request, not a recorded purchase.');
  }
  return item;
}

export type PurchaseLineEdit = {
  qty?: number;
  // Management-only; the route drops these for everyone else.
  unitCost?: number;
  supplierId?: string | null;
};

/**
 * Correct a mis-keyed buy (wrong quantity, price or supplier).
 *
 * Recording a buy does not move stock - that happens at receiving - so a
 * quantity fix only changes what receiving expects. Staff can't take it below
 * what has already been received; management can (allowBelowReceived), because
 * "bought 12, received 18" is a real finding when checking against the
 * supplier's receipt and has to be recordable.
 *
 * A wrong price is different: the buy flow copies it onto the product's default
 * cost, the supplier price book and the waiting orders' COGS, and receiving
 * copies it onto the stock ledger. Each of those is corrected only where it
 * still holds the old (wrong) value, so a cost that has since been set by a
 * newer purchase is left alone.
 */
export async function editPurchaseLine(
  supabase: SupabaseClient,
  itemId: string,
  edit: PurchaseLineEdit,
  allowBelowReceived = false,
) {
  const item = await loadPurchaseLine(supabase, itemId);

  const received = Number(item.received_qty) || 0;
  const oldQty = Number(item.expected_qty) || 0;
  const oldCost = Number(item.unit_cost) || 0;
  const oldSupplierId: string | null = item.supplier_id || null;

  const newQty = edit.qty !== undefined ? edit.qty : oldQty;
  const newCost = edit.unitCost !== undefined ? edit.unitCost : oldCost;
  const newSupplierId = edit.supplierId !== undefined ? (edit.supplierId || null) : oldSupplierId;

  if (!Number.isInteger(newQty) || newQty < 1) {
    throw new Error('Quantity must be a whole number of at least 1. To cancel the purchase, remove it instead.');
  }
  if (newQty < received && !allowBelowReceived) {
    throw new Error(`${received} pcs were already received, so the quantity can't go below ${received}.`);
  }
  if (!Number.isFinite(newCost) || newCost < 0) {
    throw new Error('Unit cost must be zero or more.');
  }

  const costChanged = newCost !== oldCost;
  const supplierChanged = newSupplierId !== oldSupplierId;

  const patch: Record<string, any> = {};
  if (newQty !== oldQty) {
    patch.expected_qty = newQty;
    patch.status = received > 0 && received >= newQty ? 'received' : 'pending_receipt';
  }
  if (costChanged) patch.unit_cost = newCost;
  if (supplierChanged) patch.supplier_id = newSupplierId;
  if (Object.keys(patch).length === 0) return { changed: false, orderLinesRecosted: 0 };

  const { error: updErr } = await supabase.from('purchase_order_items').update(patch).eq('id', itemId);
  if (updErr) throw updErr;

  let orderLinesRecosted = 0;

  if (costChanged || supplierChanged) {
    const supplierName = await resolveSupplierName(supabase, newSupplierId);

    const { data: product } = await supabase
      .from('products')
      .select('initial_unit_cost, supplier_id, supplier_pricing')
      .eq('id', item.product_id)
      .single();

    const productPatch: Record<string, any> = {};
    const currentDefault = Number(product?.initial_unit_cost) || 0;
    if (costChanged && newCost > 0 && (currentDefault === oldCost || currentDefault === 0)) {
      productPatch.initial_unit_cost = newCost;
    }
    if (supplierChanged && newSupplierId && (product?.supplier_id || null) === oldSupplierId) {
      productPatch.supplier_id = newSupplierId;
    }
    if (newSupplierId && newCost > 0) {
      const pricing: any[] = Array.isArray(product?.supplier_pricing) ? [...product!.supplier_pricing] : [];
      const idx = pricing.findIndex((sp: any) => sp.supplierId === newSupplierId);
      if (idx >= 0) {
        const bookCost = Number(pricing[idx].unitCost) || 0;
        if (bookCost === oldCost || bookCost === 0) pricing[idx] = { ...pricing[idx], unitCost: newCost };
      } else {
        pricing.push({ supplierId: newSupplierId, supplierName: supplierName || 'Unknown Supplier', unitCost: newCost });
      }
      productPatch.supplier_pricing = pricing;
    }
    if (Object.keys(productPatch).length > 0) {
      await supabase.from('products').update(productPatch).eq('id', item.product_id);
    }

    // Already (part) received: the restock entry carries the old cost/supplier.
    // inventory_movements has no FK back to the purchase line, so match the
    // latest restock of this product booked at the old cost.
    if (received > 0) {
      const { data: movements } = await supabase
        .from('inventory_movements')
        .select('id')
        .eq('product_id', item.product_id)
        .eq('unit_cost', oldCost)
        .ilike('movement_type', 'restock')
        .order('timestamp', { ascending: false })
        .limit(1);
      if (movements && movements.length > 0) {
        await supabase
          .from('inventory_movements')
          .update({ unit_cost: newCost, supplier_name: supplierName })
          .eq('id', movements[0].id);
      }
    }

    if (costChanged && oldCost > 0 && newCost > 0) {
      orderLinesRecosted = await recostOrderLines(supabase, itemId, item.product_id, oldQty, oldCost, newCost);
    }
  }

  return { changed: true, orderLinesRecosted };
}

/**
 * Undo the COGS a mis-priced buy stamped onto waiting orders (see
 * backfillOrderItemCosts). There is no link from an order line back to the buy
 * that costed it, so this only acts when the wrong price is unique to this one
 * purchase line - if another buy of the product genuinely cost the same, the
 * order lines can't be told apart and are left for manual review.
 */
async function recostOrderLines(
  supabase: SupabaseClient,
  itemId: string,
  productId: string,
  purchasedQty: number,
  oldCost: number,
  newCost: number,
): Promise<number> {
  const { data: samePrice } = await supabase
    .from('purchase_order_items')
    .select('id')
    .eq('product_id', productId)
    .eq('unit_cost', oldCost)
    .neq('id', itemId)
    .limit(1);
  if (samePrice && samePrice.length > 0) return 0;

  const { data: lines } = await supabase
    .from('order_items')
    .select('id, quantity, orders(status, created_at)')
    .eq('product_id', productId)
    .eq('cost_price_at_sale', oldCost);

  const candidates = (lines || [])
    .filter((l: any) => l.orders && !VOID_ORDER_STATUSES.includes(l.orders.status))
    .sort((a: any, b: any) => new Date(a.orders.created_at).getTime() - new Date(b.orders.created_at).getTime());

  let remaining = purchasedQty;
  let updated = 0;
  for (const line of candidates) {
    if (remaining <= 0) break;
    if (line.quantity > remaining) continue;
    await supabase.from('order_items').update({ cost_price_at_sale: newCost }).eq('id', line.id);
    remaining -= line.quantity;
    updated += 1;
  }
  return updated;
}

/**
 * Remove a buy that was recorded by mistake. Only allowed before anything has
 * been received against it - after that the stock is real and the fix belongs
 * in receiving / stock adjustment, not here.
 */
export async function removePurchaseLine(supabase: SupabaseClient, itemId: string) {
  const item = await loadPurchaseLine(supabase, itemId);

  const received = Number(item.received_qty) || 0;
  if (received > 0) {
    throw new Error(`${received} pcs were already received against this purchase, so it can't be removed. Lower the quantity instead.`);
  }

  const { error } = await supabase.from('purchase_order_items').delete().eq('id', itemId);
  if (error) throw error;

  // Don't leave an empty PO behind.
  const { data: siblings } = await supabase
    .from('purchase_order_items')
    .select('id')
    .eq('po_id', item.po_id)
    .limit(1);
  if (!siblings || siblings.length === 0) {
    await supabase.from('purchase_orders').delete().eq('id', item.po_id);
  }
}
