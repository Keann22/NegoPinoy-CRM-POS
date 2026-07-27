import { SupabaseClient } from '@supabase/supabase-js';
import { backfillOrderItemCosts } from './cost-backfill-service';

/**
 * Repairing stock that was received before anyone knew its price.
 *
 * Inventory can receive a STAFF_DRAFT item straight off the to-order sheet (see
 * /api/inventory/receive/pending-pos), which bumps stock at unit_cost 0 with no
 * supplier. Two screens let management fill that in afterwards - the Purchases
 * Report banner (keyed by purchase_order_items) and Encode Pending Costs (keyed
 * by inventory_movements) - so the shared steps live here rather than being
 * written twice and drifting apart.
 */

export async function resolveSupplierName(
  supabase: SupabaseClient,
  supplierId: string | null,
): Promise<string | null> {
  if (!supplierId) return null;
  const { data } = await supabase.from('suppliers').select('name').eq('id', supplierId).single();
  return data?.name || null;
}

/**
 * Best guess at what a receipt should be costed/sourced at, from what we already
 * know about the product. Same cascade the Purchases Report banner shows as its
 * pre-fill (last real purchase → product default cost → supplier price book),
 * lifted here so the receive path can act on it automatically instead of leaving
 * every to-order receipt for a human to confirm by hand.
 *
 * `source` is non-null only when a positive cost was actually found; callers use
 * it as the "we're confident enough to auto-record" signal.
 */
export type CostSuggestion = {
  supplierId: string | null;
  supplierName: string | null;
  unitCost: number;
  source: string | null;
};

export async function suggestSupplierAndCost(
  supabase: SupabaseClient,
  productId: string,
  lineUnitCost: number | null,
  lineSupplierId: string | null,
): Promise<CostSuggestion> {
  // Most recent purchase that actually carried a price. STAFF_DRAFT lines sit at
  // unit_cost 0, so the >0 filter excludes them automatically.
  const { data: priced } = await supabase
    .from('purchase_order_items')
    .select('unit_cost, supplier_id, purchase_orders!inner(created_at), suppliers(name)')
    .eq('product_id', productId)
    .gt('unit_cost', 0);

  let lastPurchase: { at: string | null; unitCost: number; supplierId: string | null; supplierName: string | null } | null = null;
  (priced || []).forEach((row: any) => {
    const at = row.purchase_orders?.created_at || null;
    if (!lastPurchase || (at && lastPurchase.at && new Date(at) > new Date(lastPurchase.at)) || (at && !lastPurchase.at)) {
      lastPurchase = {
        at,
        unitCost: Number(row.unit_cost) || 0,
        supplierId: row.supplier_id || null,
        supplierName: row.suppliers?.name || null,
      };
    }
  });

  const { data: prod } = await supabase
    .from('products')
    .select('supplier_id, initial_unit_cost, supplier_pricing')
    .eq('id', productId)
    .single();
  const pricing: any[] = prod?.supplier_pricing || [];
  const book = pricing.length > 0 ? pricing[pricing.length - 1] : null;

  let unitCost = 0;
  let source: string | null = null;
  let supplierId: string | null = lineSupplierId || null;
  let supplierName: string | null = null;

  if (Number(lineUnitCost) > 0) {
    unitCost = Number(lineUnitCost);
    source = 'already on this receipt';
  } else if (lastPurchase && (lastPurchase as any).unitCost > 0) {
    const lp = lastPurchase as any;
    unitCost = lp.unitCost;
    source = 'last purchase';
    if (!supplierId) { supplierId = lp.supplierId; supplierName = lp.supplierName; }
  } else if (Number(prod?.initial_unit_cost) > 0) {
    unitCost = Number(prod!.initial_unit_cost);
    source = 'product default cost';
  } else if (Number(book?.unitCost) > 0) {
    unitCost = Number(book.unitCost);
    source = 'supplier price book';
    if (!supplierId) { supplierId = book.supplierId || null; supplierName = book.supplierName || null; }
  }

  // Fall back to the product's own supplier if the cost source didn't carry one.
  if (!supplierId) supplierId = prod?.supplier_id || null;
  if (supplierId && !supplierName) supplierName = await resolveSupplierName(supabase, supplierId);

  return { supplierId, supplierName, unitCost, source };
}

/**
 * Product-level cost, so orders created from here on snapshot the right number,
 * plus the per-supplier price book used to pre-fill these screens next time.
 */
export async function applyProductCost(
  supabase: SupabaseClient,
  productId: string,
  cost: number,
  supplierId: string | null,
  supplierName: string | null,
): Promise<void> {
  if (!(cost > 0)) return;

  const { data: product } = await supabase
    .from('products')
    .select('supplier_pricing')
    .eq('id', productId)
    .single();

  const supplierPricing: any[] = product?.supplier_pricing || [];
  if (supplierId && supplierName) {
    const existing = supplierPricing.findIndex((sp: any) => sp.supplierId === supplierId);
    if (existing >= 0) {
      supplierPricing[existing].unitCost = cost;
    } else {
      supplierPricing.push({ supplierId, supplierName, unitCost: cost });
    }
  }

  await supabase
    .from('products')
    .update({ initial_unit_cost: cost, supplier_pricing: supplierPricing })
    .eq('id', productId);
}

/**
 * The ledger entry for the receipt. inventory_movements has no FK back to the
 * purchase_order_items row, so attribution is best-effort: match on product and
 * take the most recent uncosted RESTOCK. Returns its timestamp, which is the
 * closest thing we have to "when the goods actually landed".
 */
export type ReceiptMovement = { id: string; timestamp: string; quantity_change: number };

/** Read-only lookup, so callers can learn the receipt date before mutating anything. */
export async function findReceiptMovement(
  supabase: SupabaseClient,
  productId: string,
): Promise<ReceiptMovement | null> {
  const { data } = await supabase
    .from('inventory_movements')
    .select('id, timestamp, quantity_change')
    .eq('product_id', productId)
    .eq('unit_cost', 0)
    .ilike('movement_type', 'restock')
    .order('timestamp', { ascending: false })
    .limit(1);

  return data && data.length > 0 ? (data[0] as ReceiptMovement) : null;
}

/**
 * When the goods landed, for dating the purchase. Deliberately looks at ANY
 * restock, not just uncosted ones: a part-repaired row already has a cost on its
 * movement, and falling back to "now" would file the buy under today instead of
 * the day it actually arrived.
 */
export async function findReceiptDate(
  supabase: SupabaseClient,
  productId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('inventory_movements')
    .select('timestamp')
    .eq('product_id', productId)
    .ilike('movement_type', 'restock')
    .order('timestamp', { ascending: false })
    .limit(1);

  return data && data.length > 0 ? data[0].timestamp : null;
}

export async function repairReceiptMovement(
  supabase: SupabaseClient,
  productId: string,
  cost: number,
  supplierName: string | null,
  qtyDelta = 0,
  known: ReceiptMovement | null | undefined = undefined,
): Promise<{ updated: boolean; receiptTimestamp: string | null }> {
  const movement = known !== undefined ? known : await findReceiptMovement(supabase, productId);
  const movements = movement ? [movement] : [];

  if (movements.length === 0) {
    // No uncosted receipt to correct. A quantity fix still has to leave a trail,
    // so book it as its own adjustment rather than moving stock silently.
    if (qtyDelta !== 0) {
      await supabase.from('inventory_movements').insert({
        product_id: productId,
        quantity_change: qtyDelta,
        movement_type: 'adjustment',
        unit_cost: cost > 0 ? cost : 0,
        supplier_name: supplierName,
        reason: 'Received quantity corrected from the Purchases Report',
      });
    }
    return { updated: false, receiptTimestamp: null };
  }

  const patch: Record<string, any> = { supplier_name: supplierName };
  if (cost > 0) patch.unit_cost = cost;
  // Correcting a mis-keyed receipt amends the original ledger entry, so the
  // restock reads as what actually arrived instead of leaving a phantom
  // quantity offset by a separate adjustment.
  if (qtyDelta !== 0) {
    patch.quantity_change = Number(movements[0].quantity_change || 0) + qtyDelta;
  }

  await supabase.from('inventory_movements').update(patch).eq('id', movements[0].id);

  return { updated: true, receiptTimestamp: movements[0].timestamp };
}

/**
 * Make the buy visible in the Purchases Report. The report reads
 * purchase_order_items bucketed by their parent PO's created_at and skips
 * STAFF_DRAFT POs entirely, so setting supplier/cost in place is not enough for
 * a draft item - it has to move onto a real PO dated to when the goods landed.
 *
 * An item already sitting on a real PO (the "has a cost, just no supplier" case)
 * is left where it is: it already appears in the report, merely grouped under
 * "No Supplier", and moving it would rewrite a purchase date we know is correct.
 */
export async function createBackfillPurchaseOrder(
  supabase: SupabaseClient,
  receiptTimestamp: string | null,
): Promise<string> {
  // purchase_orders_status_check only permits pending_receipt /
  // partially_received / received - the goods are already in, so 'received'.
  const { data: newPo, error: poErr } = await supabase
    .from('purchase_orders')
    .insert({
      status: 'received',
      notes: null,
      ...(receiptTimestamp ? { created_at: receiptTimestamp } : {}),
    })
    .select('id')
    .single();
  if (poErr) throw poErr;
  return newPo.id;
}

export async function linkPurchaseItem(
  supabase: SupabaseClient,
  itemId: string,
  supplierId: string | null,
  cost: number,
  poId: string | null,
): Promise<void> {
  const patch: Record<string, any> = { supplier_id: supplierId || null };
  if (cost > 0) patch.unit_cost = cost;
  if (poId) patch.po_id = poId;

  const { error } = await supabase.from('purchase_order_items').update(patch).eq('id', itemId);
  if (error) throw error;
}

export type RepairResult = {
  linesUpdated: number;
  cogsAdded: number;
  movementUpdated: boolean;
  supplierName: string | null;
  qtyDelta: number;
  /** Set when the line was valued at stale demand and is now valued at delivery. */
  expectedWas: number | null;
  expectedNow: number | null;
};

/**
 * Full repair keyed from the purchase_order_items side - what the Purchases
 * Report banner submits.
 *
 * receivedQty is optional and only meaningful as a correction: a mis-keyed
 * receipt (10110 typed for a single tub of cream) inflates three things at once
 * - the purchase line, the ledger entry, and live stock - so all three move
 * together here rather than being patched on separate screens.
 */
export async function repairFromPurchaseItem(
  supabase: SupabaseClient,
  itemId: string,
  supplierId: string | null,
  unitCost: number | null,
  receivedQty: number | null = null,
  receivedAt: string | null = null,
): Promise<RepairResult> {
  const { data: item, error: itemErr } = await supabase
    .from('purchase_order_items')
    .select('id, product_id, created_at, expected_qty, received_qty, unit_cost, supplier_id, purchase_orders!inner(notes)')
    .eq('id', itemId)
    .single();
  if (itemErr) throw itemErr;

  // Whatever the caller left blank, keep what is already recorded.
  const cost = unitCost && unitCost > 0 ? Number(unitCost) : Number(item.unit_cost) || 0;
  const isStaffDraft = (item as any).purchase_orders?.notes === 'STAFF_DRAFT';
  const currentQty = Number(item.received_qty) || 0;
  const newQty = receivedQty !== null && receivedQty >= 0 ? Number(receivedQty) : currentQty;
  const qtyDelta = newQty - currentQty;

  const supplierName = await resolveSupplierName(supabase, supplierId);

  // Everything that can fail on a constraint happens up front, before a single
  // mutation - a failed insert here used to leave the ledger and product cost
  // already written while the purchase line stayed untouched.
  const movement = await findReceiptMovement(supabase, item.product_id);
  // An explicit date always wins - attribution from movements is best-effort and
  // the person looking at the delivery knows better than the heuristic. Failing
  // that: the uncosted receipt, then any restock, then when the line was raised.
  // Never "now", which would file an old buy under today.
  const receiptTimestamp =
    receivedAt
    || movement?.timestamp
    || (await findReceiptDate(supabase, item.product_id))
    || item.created_at
    || null;
  const poId = isStaffDraft ? await createBackfillPurchaseOrder(supabase, receiptTimestamp) : null;

  let movementUpdated = false;
  if (cost > 0 || qtyDelta !== 0) {
    const res = await repairReceiptMovement(supabase, item.product_id, cost, supplierName, qtyDelta, movement);
    movementUpdated = res.updated;
  }
  if (cost > 0) {
    await applyProductCost(supabase, item.product_id, cost, supplierId, supplierName);
  }

  if (qtyDelta !== 0) {
    const { error: stockErr } = await supabase.rpc('increment_stock', {
      p_product_id: item.product_id,
      qty: qtyDelta,
    });
    if (stockErr) throw stockErr;
  }

  // expected_qty on a STAFF_DRAFT line is a live demand counter - how many
  // customers are waiting right now - which autoCleanupStaffDrafts raises and
  // lowers as orders come and go. Left alone, the Purchases Report would value
  // this buy at that counter, so reported spend could drift on a day nothing was
  // bought. Recording the purchase is the moment it stops being demand and
  // becomes history, so pin it to what actually arrived.
  //
  // Items already on a real PO keep their expected_qty: there it means "what we
  // ordered", and a shortfall against it is real information worth preserving.
  const alignExpected = isStaffDraft && newQty > 0;

  if (qtyDelta !== 0 || alignExpected) {
    const patch: Record<string, any> = {};
    if (qtyDelta !== 0) patch.received_qty = newQty;
    if (alignExpected) patch.expected_qty = newQty;

    const effectiveExpected = alignExpected ? newQty : Number(item.expected_qty) || 0;
    patch.status = newQty >= effectiveExpected ? 'received' : 'pending_receipt';

    const { error: itemPatchErr } = await supabase
      .from('purchase_order_items')
      .update(patch)
      .eq('id', itemId);
    if (itemPatchErr) throw itemPatchErr;
  }

  await linkPurchaseItem(supabase, itemId, supplierId, cost, poId);

  const { linesUpdated, cogsAdded } = await backfillOrderItemCosts(supabase, item.product_id, newQty, cost);

  const previousExpected = Number(item.expected_qty) || 0;
  const expectedChanged = alignExpected && previousExpected !== newQty;

  return {
    linesUpdated,
    cogsAdded,
    movementUpdated,
    supplierName,
    qtyDelta,
    expectedWas: expectedChanged ? previousExpected : null,
    expectedNow: expectedChanged ? newQty : null,
  };
}
