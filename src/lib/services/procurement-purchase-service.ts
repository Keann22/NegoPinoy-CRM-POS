import { SupabaseClient } from '@supabase/supabase-js';
import { backfillOrderItemCosts } from './cost-backfill-service';

export async function processProcurementPurchases(supabase: SupabaseClient, purchases: any[]) {
  if (!purchases || purchases.length === 0) {
    throw new Error('No purchases provided');
  }

  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .insert({ status: 'pending_receipt' })
    .select('id')
    .single();

  if (poErr) throw poErr;

  for (const p of purchases) {
    const parsedCost = Number(p.cost) || 0;
    
    if (p.draftItemId) {
      const { error: updErr } = await supabase
        .from('purchase_order_items')
        .update({
          po_id: po.id,
          supplier_id: p.supplierId || null,
          expected_qty: p.qty,
          unit_cost: parsedCost,
          status: 'pending_receipt'
        })
        .eq('id', p.draftItemId);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase
        .from('purchase_order_items')
        .insert({
          po_id: po.id,
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

  return po.id;
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
  supplierId: string,
  supplierCode: string
) {
  const code = (supplierCode || '').trim();
  if (!code) return;

  const { data: currentProduct } = await supabase
    .from('products')
    .select('supplier_pricing')
    .eq('id', productId)
    .single();
  const pricing = currentProduct?.supplier_pricing || [];

  const idx = pricing.findIndex((sp: any) => sp.supplierId === supplierId);
  if (idx >= 0) {
    pricing[idx].supplierCode = code;
  } else {
    const { data: sup } = await supabase.from('suppliers').select('name').eq('id', supplierId).single();
    pricing.push({
      supplierId,
      supplierName: sup?.name || 'Unknown Supplier',
      unitCost: 0,
      supplierCode: code,
    });
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
