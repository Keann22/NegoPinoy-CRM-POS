import { SupabaseClient } from '@supabase/supabase-js';
import { backfillOrderItemCosts } from './cost-backfill-service';
import { splitStaffDraftLine } from './procurement-service';
import { updatePoTracking, type TrackingInput } from './online-order-tracking-service';

export async function processProcurementPurchases(
  supabase: SupabaseClient,
  purchases: any[],
  // Online orders (Pinduoduo, Shopee, ...): shipment details for the new PO.
  tracking?: TrackingInput | null,
  actorName = 'Admin'
) {
  if (!purchases || purchases.length === 0) {
    throw new Error('No purchases provided');
  }

  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .insert({ status: 'pending_receipt' })
    .select('id')
    .single();

  if (poErr) throw poErr;

  if (tracking?.route) {
    await updatePoTracking(supabase, po.id, tracking, actorName);
  }

  for (const p of purchases) {
    await recordPurchaseLine(supabase, po.id, p);
  }

  await removeEmptyDraftPos(supabase);

  return po.id;
}

/**
 * Adds items to an already-recorded purchase (e.g. something left out of a
 * Pinduoduo checkout). Each line is recorded exactly like a Buy, including
 * taking over the product's open staff request.
 */
export async function addLinesToPurchaseOrder(
  supabase: SupabaseClient,
  poId: string,
  lines: { productId: string; qty: number; cost: number; supplierId?: string | null }[]
) {
  if (!lines || lines.length === 0) throw new Error('No items provided');
  for (const l of lines) {
    if (!l.productId) throw new Error('Pick a product');
    if (!Number.isInteger(Number(l.qty)) || Number(l.qty) < 1) throw new Error('Quantity must be a whole number of at least 1');
    if (!(Number(l.cost) >= 0)) throw new Error('Unit cost must be zero or more');
  }

  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .select('id, notes, status, purchase_order_items(supplier_id)')
    .eq('id', poId)
    .single();
  if (poErr || !po) throw new Error('Purchase order not found');
  if (po.notes === 'STAFF_DRAFT') throw new Error('Staff requests cannot be edited here');

  // Bundles hold no stock; procurement tracks their parts.
  const { data: products } = await supabase
    .from('products')
    .select('id, name, assembly_recipe')
    .in('id', lines.map((l) => l.productId));
  const bundle = (products || []).find((p: any) => Array.isArray(p.assembly_recipe) && p.assembly_recipe.length > 0);
  if (bundle) {
    const parts = bundle.assembly_recipe.map((c: any) => c.productName).filter(Boolean).join(' + ');
    throw new Error(`"${bundle.name}" is a bundle. Add its parts instead${parts ? `: ${parts}` : ''}.`);
  }

  // Default to the supplier most of the order's lines were bought from.
  const counts = new Map<string, number>();
  (po.purchase_order_items || []).forEach((i: any) => {
    if (i.supplier_id) counts.set(i.supplier_id, (counts.get(i.supplier_id) || 0) + 1);
  });
  const orderSupplierId = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const { data: drafts } = await supabase
    .from('purchase_order_items')
    .select('id, product_id, purchase_orders!inner(notes)')
    .eq('purchase_orders.notes', 'STAFF_DRAFT')
    .eq('status', 'pending_receipt')
    .in('product_id', lines.map((l) => l.productId));
  const draftByProduct = new Map((drafts || []).map((d: any) => [d.product_id, d.id]));

  for (const l of lines) {
    await recordPurchaseLine(supabase, poId, {
      productId: l.productId,
      qty: Number(l.qty),
      cost: Number(l.cost),
      supplierId: l.supplierId || orderSupplierId,
      draftItemId: draftByProduct.get(l.productId) || null,
    });
  }

  // The order has something to receive again.
  if (po.status === 'received') {
    await supabase.from('purchase_orders').update({ status: 'partially_received' }).eq('id', poId);
  }

  await removeEmptyDraftPos(supabase);
}

/**
 * Records one bought line on a purchase order: takes over the product's staff
 * request (if any), stamps supplier/cost onto the product, backfills waiting
 * orders' COGS and resolves open procurement issues.
 */
async function recordPurchaseLine(supabase: SupabaseClient, poId: string, p: any) {
  const parsedCost = Number(p.cost) || 0;
  
  if (p.draftItemId) {
    // Buying less than staff requested must leave the rest on the draft.
    const itemId = await splitStaffDraftLine(supabase, p.draftItemId, Number(p.qty) || 0, poId);
    const { error: updErr } = await supabase
      .from('purchase_order_items')
      .update({
        po_id: poId,
        supplier_id: p.supplierId || null,
        expected_qty: p.qty,
        unit_cost: parsedCost,
        status: 'pending_receipt'
      })
      .eq('id', itemId);
    if (updErr) throw updErr;
  } else {
    const { error: insErr } = await supabase
      .from('purchase_order_items')
      .insert({
        po_id: poId,
        product_id: p.productId,
        supplier_id: p.supplierId || null,
        expected_qty: p.qty,
        unit_cost: parsedCost,
        status: 'pending_receipt'
      });
    if (insErr) throw insErr;
  }

  const productUpdate: any = {};
  if (parsedCost > 0) {
    productUpdate.initial_unit_cost = parsedCost;
  }
  if (p.supplierId) {
    productUpdate.supplier_id = p.supplierId;

    const { data: currentProduct } = await supabase
      .from('products')
      .select('supplier_pricing')
      .eq('id', p.productId)
      .single();
    const pricing = currentProduct?.supplier_pricing || [];
    const { data: sup } = await supabase
      .from('suppliers')
      .select('name')
      .eq('id', p.supplierId)
      .single();
    const supplierName = sup?.name || 'Unknown Supplier';
    const idx = pricing.findIndex((sp: any) => sp.supplierId === p.supplierId);
    if (idx >= 0) {
      if (parsedCost > 0) pricing[idx].unitCost = parsedCost;
      pricing[idx].supplierName = supplierName;
    } else {
      pricing.push({ supplierId: p.supplierId, supplierName, unitCost: parsedCost });
    }
    productUpdate.supplier_pricing = pricing;
  }
  if (Object.keys(productUpdate).length > 0) {
    await supabase.from('products').update(productUpdate).eq('id', p.productId);
  }

  if (parsedCost > 0) {
    await backfillOrderItemCosts(supabase, p.productId, Number(p.qty) || 0, parsedCost);
  }

  const { data: issues } = await supabase
    .from('procurement_issues')
    .select('id')
    .eq('product_id', p.productId)
    .eq('status', 'open');

  if (issues && issues.length > 0) {
    for (const issue of issues) {
      await supabase
        .from('procurement_issues')
        .update({ status: 'resolved' })
        .eq('id', issue.id);

      await supabase
        .from('procurement_issue_messages')
        .insert({
          issue_id: issue.id,
          sender_role: 'system',
          sender_name: 'System',
          message: 'Issue automatically resolved because the item was purchased.'
        });
    }
  }
}

// Don't leave an empty STAFF_DRAFT PO behind once its lines were bought.
async function removeEmptyDraftPos(supabase: SupabaseClient) {
  const { data: emptyDraftPos } = await supabase
    .from('purchase_orders')
    .select('id, purchase_order_items(id)')
    .eq('notes', 'STAFF_DRAFT');
    
  if (emptyDraftPos) {
    for (const draftPo of emptyDraftPos) {
      if (draftPo.purchase_order_items.length === 0) {
        await supabase.from('purchase_orders').delete().eq('id', draftPo.id);
      }
    }
  }
}

/**
 * Records the supplier's own product code for a product, keyed by supplier, in
 * the product's `supplier_pricing` JSONB array. This is what lets a scanned
 * receipt auto-match the same item next time by its supplier code. It only
 * touches the supplier code (creating the pricing entry if none exists yet) and
 * deliberately does NOT reassign `products.supplier_id`.
 */
export async function setSupplierProductCode(
  supabase: SupabaseClient,
  productId: string,
  supplierId: string | null | undefined,
  supplierCode: string
) {
  const code = (supplierCode || '').trim();
  if (!code) return;

  const { data: currentProduct } = await supabase
    .from('products')
    .select('supplier_pricing, supplier_id')
    .eq('id', productId)
    .single();
  const pricing = currentProduct?.supplier_pricing || [];

  const effectiveSupplierId = supplierId || currentProduct?.supplier_id || null;

  if (effectiveSupplierId) {
    const idx = pricing.findIndex((sp: any) => sp.supplierId === effectiveSupplierId);
    if (idx >= 0) {
      pricing[idx].supplierCode = code;
    } else {
      const { data: sup } = await supabase.from('suppliers').select('name').eq('id', effectiveSupplierId).single();
      pricing.push({
        supplierId: effectiveSupplierId,
        supplierName: sup?.name || 'Unknown Supplier',
        unitCost: 0,
        supplierCode: code,
      });
    }
  } else {
    const idx = pricing.findIndex((sp: any) => sp.supplierCode !== undefined);
    if (idx >= 0) {
      pricing[idx].supplierCode = code;
    } else {
      pricing.push({
        supplierId: null,
        supplierName: 'Unassigned',
        unitCost: 0,
        supplierCode: code,
      });
    }
  }

  const { error } = await supabase.from('products').update({ supplier_pricing: pricing }).eq('id', productId);
  if (error) throw error;
}

export async function updateProductSupplierPricing(supabase: SupabaseClient, productId: string, newSupplierId: string, unitCost: number | undefined) {
  const { data: currentProduct } = await supabase.from('products').select('supplier_pricing, initial_unit_cost').eq('id', productId).single();
  const newPricing = currentProduct?.supplier_pricing || [];
  
  const { data: sup } = await supabase.from('suppliers').select('name').eq('id', newSupplierId).single();
  const supplierName = sup?.name || 'Unknown Supplier';

  const parsedCost = Number(unitCost) || currentProduct?.initial_unit_cost || 0;

  const existingIdx = newPricing.findIndex((sp: any) => sp.supplierId === newSupplierId);
  if (existingIdx >= 0) {
    if (unitCost !== undefined) newPricing[existingIdx].unitCost = parsedCost;
  } else {
    newPricing.push({ supplierId: newSupplierId, supplierName, unitCost: parsedCost });
  }

  const updatePayload: any = { 
    supplier_id: newSupplierId, 
    supplier_pricing: newPricing 
  };
  if (unitCost !== undefined && parsedCost > 0) {
    updatePayload.initial_unit_cost = parsedCost;
  }

  const { error } = await supabase.from('products').update(updatePayload).eq('id', productId);
  if (error) throw error;
}
