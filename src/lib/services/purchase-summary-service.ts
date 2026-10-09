import { SupabaseClient } from '@supabase/supabase-js';
import { VOID_ORDER_STATUSES, backfillOrderItemCosts } from './cost-backfill-service';
import {
  resolveSupplierName,
  suggestSupplierAndCost,
  applyProductCost,
  createBackfillPurchaseOrder,
} from './purchase-repair-service';

// Supplier identities and costs are management-only. Roles live in the user's
// metadata (same source the dashboard reads via useUserProfile). We check both
// app_metadata (server-controlled, preferred) and user_metadata, and default to
// deny — no session, or no recognised role, means staff-level access.
export function isManagementUser(user: any): boolean {
  const collect = (meta: any): string[] => {
    if (!meta) return [];
    if (Array.isArray(meta.roles)) return meta.roles.map((r: string) => String(r).toLowerCase());
    if (meta.role) return [String(meta.role).toLowerCase()];
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

/**
 * Stock received in [start, end] that has no purchase behind it.
 *
 * An "unexpected" receipt bumps stock and writes a RESTOCK movement but never
 * creates a purchase_order_items row, so the buy is invisible to
 * fetchPurchasesInRange (and to the Purchases report). These are listed
 * separately so the day's summary matches what actually arrived.
 */
export async function fetchUnrecordedReceipts(
  supabase: SupabaseClient,
  start: string,
  end: string,
  withSuggestions: boolean,
) {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('id, product_id, quantity_change, timestamp, unit_cost, products(name, variant_name)')
    .ilike('movement_type', 'restock')
    .eq('reason', UNEXPECTED_REASON)
    .gte('timestamp', start)
    .lte('timestamp', end)
    .order('timestamp', { ascending: true })
    .limit(1000);
  if (error) throw error;

  return Promise.all((data || []).map(async (m: any) => {
    const prod = m.products;
    let productName = prod?.name || 'Unknown Product';
    if (prod?.variant_name && !productName.includes(prod.variant_name)) {
      productName = `${productName} [${prod.variant_name}]`;
    }
    // Pre-fill from what we already know about the product (management only -
    // the suggestion names a supplier and a cost).
    const suggestion = withSuggestions
      ? await suggestSupplierAndCost(supabase, m.product_id, Number(m.unit_cost) || null, null)
      : null;
    return {
      movementId: m.id as string,
      productId: m.product_id as string,
      productName,
      qty: Number(m.quantity_change) || 0,
      receivedAt: m.timestamp as string,
      suggestedSupplierId: suggestion?.supplierId || null,
      suggestedUnitCost: suggestion?.unitCost || 0,
    };
  }));
}

/**
 * Turn an unexpected receipt into a proper purchase: a received line on a PO
 * dated to when the goods landed, with the cost pushed everywhere a normal buy
 * puts it. Stock is NOT touched - receiving already counted these units.
 */
export async function recordReceiptAsPurchase(
  supabase: SupabaseClient,
  movementId: string,
  supplierId: string | null,
  unitCost: number,
) {
  if (!Number.isFinite(unitCost) || !(unitCost > 0)) {
    throw new Error('Enter the unit cost to record this as a purchase.');
  }

  const { data: movement, error } = await supabase
    .from('inventory_movements')
    .select('id, product_id, quantity_change, timestamp, reason')
    .eq('id', movementId)
    .single();
  if (error) throw error;
  if (movement.reason !== UNEXPECTED_REASON) {
    throw new Error('This receipt was already recorded as a purchase.');
  }

  const qty = Number(movement.quantity_change) || 0;
  if (!(qty > 0)) throw new Error('This receipt has no quantity to record.');

  const supplierName = await resolveSupplierName(supabase, supplierId);

  const poId = await createBackfillPurchaseOrder(supabase, movement.timestamp);
  const { error: insErr } = await supabase.from('purchase_order_items').insert({
    po_id: poId,
    product_id: movement.product_id,
    supplier_id: supplierId || null,
    expected_qty: qty,
    received_qty: qty,
    unit_cost: unitCost,
    status: 'received',
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
  await backfillOrderItemCosts(supabase, movement.product_id, qty, unitCost);
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
 * quantity fix only changes what receiving expects. It can't go below what has
 * already been received.
 *
 * A wrong price is different: the buy flow copies it onto the product's default
 * cost, the supplier price book and the waiting orders' COGS, and receiving
 * copies it onto the stock ledger. Each of those is corrected only where it
 * still holds the old (wrong) value, so a cost that has since been set by a
 * newer purchase is left alone.
 */
export async function editPurchaseLine(supabase: SupabaseClient, itemId: string, edit: PurchaseLineEdit) {
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
  if (newQty < received) {
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
