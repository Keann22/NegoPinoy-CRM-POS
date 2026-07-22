import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { backfillOrderItemCosts } from '@/lib/services/cost-backfill-service';
import { resolveSupplierName, applyProductCost, linkPurchaseItem, createBackfillPurchaseOrder } from '@/lib/services/purchase-repair-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Encoding the cost of stock that was received before anyone knew its price.
 *
 * Inventory can receive a STAFF_DRAFT item straight off the to-order sheet (see
 * /api/inventory/receive/pending-pos), which bumps stock at unit_cost 0 with no
 * supplier. This is where management fills that in afterwards, and it has to
 * repair three separate things or the money stays unaccounted:
 *
 *   1. the inventory_movements row (the ledger entry itself)
 *   2. order_items.cost_price_at_sale on whatever already sold from that stock
 *      - the ONLY input to the P&L's COGS line
 *   3. the purchase_order_items row, moved onto a real PO dated to the receipt,
 *      so the buy finally appears in the Purchases Report under its supplier
 *
 * Note this deliberately does NOT write an expenses row with category
 * 'Cost of Goods Sold'. That was the previous behaviour and it silently lost the
 * money: the P&L excludes that category from operating expenses and never reads
 * it back for COGS, so those rows landed nowhere. COGS moves via (2) only.
 */
export async function POST(req: Request) {
  try {
    const { movementId, unitCost, supplierId, quantity } = await req.json();

    const cost = Number(unitCost);
    if (!movementId) {
      return NextResponse.json({ error: 'movementId is required' }, { status: 400 });
    }
    if (!(cost > 0)) {
      return NextResponse.json({ error: 'Unit cost must be greater than 0.' }, { status: 400 });
    }

    const { data: movement, error: moveErr } = await supabase
      .from('inventory_movements')
      .select('id, product_id, quantity_change, timestamp, reason')
      .eq('id', movementId)
      .single();
    if (moveErr) throw moveErr;

    const newQty = Number(quantity ?? movement.quantity_change);
    if (!(newQty > 0)) {
      return NextResponse.json({ error: 'Quantity must be greater than 0.' }, { status: 400 });
    }

    const supplierName = await resolveSupplierName(supabase, supplierId || null);

    // 1. The ledger entry
    const { error: updMoveErr } = await supabase
      .from('inventory_movements')
      .update({ unit_cost: cost, supplier_name: supplierName, quantity_change: newQty })
      .eq('id', movementId);
    if (updMoveErr) throw updMoveErr;

    // Correcting the qty while encoding the cost has to move real stock too,
    // since the original receive already incremented by the old number.
    const qtyDifference = newQty - Number(movement.quantity_change || 0);
    if (qtyDifference !== 0) {
      const { error: stockErr } = await supabase.rpc('increment_stock', {
        p_product_id: movement.product_id,
        qty: qtyDifference,
      });
      if (stockErr) throw stockErr;
    }

    // 2. Product-level cost, so future orders snapshot the right number
    await applyProductCost(supabase, movement.product_id, cost, supplierId || null, supplierName);

    // 3. COGS on anything already sold out of this stock
    const { linesUpdated, cogsAdded } = await backfillOrderItemCosts(
      supabase, movement.product_id, newQty, cost,
    );

    // 4. Surface the buy in the Purchases Report. Attribution is best-effort:
    //    inventory_movements has no FK back to the item, so we match on product
    //    and take the most recent uncosted receipt.
    let linkedPurchase = false;
    const { data: candidates } = await supabase
      .from('purchase_order_items')
      .select('id, purchase_orders!inner(notes)')
      .eq('product_id', movement.product_id)
      .gt('received_qty', 0)
      .or('supplier_id.is.null,unit_cost.is.null,unit_cost.eq.0')
      .order('created_at', { ascending: false })
      .limit(1);

    if (candidates && candidates.length > 0) {
      const isStaffDraft = (candidates[0] as any).purchase_orders?.notes === 'STAFF_DRAFT';
      const poId = isStaffDraft ? await createBackfillPurchaseOrder(supabase, movement.timestamp) : null;
      await linkPurchaseItem(supabase, candidates[0].id, supplierId || null, cost, poId);
      linkedPurchase = true;
    }

    return NextResponse.json({
      success: true,
      linesUpdated,
      cogsAdded,
      linkedPurchase,
      supplierName,
    });
  } catch (error: any) {
    console.error('Error saving pending cost:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
