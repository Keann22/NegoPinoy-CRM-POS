import { SupabaseClient } from '@supabase/supabase-js';
import { backfillOrderItemCosts } from './cost-backfill-service';
export const ALL_OPEN_STATUSES = [
  'Pending Payment', 'Processing', 'Picked', 'Picked (with issue)', 'Photo',
  'Packed', 'For Shipping', 'For Pick-up', 'On-Hold', 'Waiting for Stock',
];

// Statuses where the item has NOT yet been physically found and secured by a
// picker. Once an order reaches Picked/Photo/Packed/For Shipping/For Pick-up,
// a staff member already pulled a real unit for it — buying more wouldn't
// help that order. This narrower set is what actually needs purchasing.
export const UNFULFILLED_STATUSES = [
  'Processing', 'Picked (with issue)', 'Waiting for Stock',
];

/**
 * Distinct sales reps who own an order still waiting on this product (i.e. the
 * order hasn't been picked yet, so it actually depends on more stock arriving).
 * Used to ping the specific people affected by a shortage/discrepancy for a
 * product, not just the Admin/Inventory leads who handle purchasing generally.
 */
export async function getAffectedSalesReps(supabase: SupabaseClient, productId: string): Promise<string[]> {
  return Array.from((await getAffectedSalesRepOrders(supabase, productId)).keys());
}

/**
 * Same as getAffectedSalesReps, but keeps each rep's affected order (the oldest
 * still-unfulfilled one containing the product), so a notification sent to that
 * rep can link straight to their order.
 */
export async function getAffectedSalesRepOrders(supabase: SupabaseClient, productId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('order_items')
    .select('quantity, orders!inner(id, order_date, status, sales_person_name)')
    .eq('product_id', productId)
    .in('orders.status', UNFULFILLED_STATUSES);

  if (error) {
    console.error('Error fetching affected sales reps:', error);
    return new Map();
  }

  const ordersByRep = new Map<string, { id: string; orderDate: string }>();
  (data || []).forEach((row: any) => {
    const name = row.orders?.sales_person_name;
    if (!name || !row.orders?.id) return;

    const existing = ordersByRep.get(name);
    if (!existing || new Date(row.orders.order_date).getTime() < new Date(existing.orderDate).getTime()) {
      ordersByRep.set(name, { id: row.orders.id, orderDate: row.orders.order_date });
    }
  });

  return new Map(Array.from(ordersByRep, ([name, order]) => [name, order.id]));
}

/**
 * A picker/staff request for a bundle product (e.g. "Wok Pan with Takip")
 * normally gets expanded onto its components at request time — but if the 
 * bundle's assembly_recipe wasn't configured yet at that moment, the draft 
 * lands on the bundle's own product_id instead, and nothing re-checks it 
 * afterwards. Suppliers only sell the raw components, so a bundle can never 
 * actually be "bought" here.
 * Self-heal any such leaked draft by migrating it onto its components, 
 * merging into whatever component draft already exists.
 */
export async function migrateLeakedBundleDrafts(supabase: SupabaseClient) {
  const { data: staffDraftItems } = await supabase
    .from('purchase_order_items')
    .select('id, po_id, product_id, expected_qty, requested_by_name, purchase_orders!inner(notes)')
    .eq('purchase_orders.notes', 'STAFF_DRAFT')
    .eq('status', 'pending_receipt');

  if (!staffDraftItems || staffDraftItems.length === 0) return;

  const { data: products } = await supabase
    .from('products')
    .select('id, assembly_recipe')
    .in('id', staffDraftItems.map(i => i.product_id));

  const recipeMap = new Map((products || []).map(p => [p.id, Array.isArray(p.assembly_recipe) ? p.assembly_recipe : []]));
  const leaked = staffDraftItems.filter(i => (recipeMap.get(i.product_id) || []).length > 0);

  for (const leak of leaked) {
    // Claim the leak first by deleting it atomically per row
    const { data: claimed } = await supabase
      .from('purchase_order_items')
      .delete()
      .eq('id', leak.id)
      .select('id');

    if (!claimed || claimed.length === 0) continue;

    for (const comp of recipeMap.get(leak.product_id)!) {
      const componentId = comp.productId || comp.component_id;
      if (!componentId) continue;
      const addQty = leak.expected_qty * (comp.quantity || 1);

      const { data: existingComponentDraft } = await supabase
        .from('purchase_order_items')
        .select('id, expected_qty')
        .eq('po_id', leak.po_id)
        .eq('product_id', componentId)
        .maybeSingle();

      if (existingComponentDraft) {
        await supabase
          .from('purchase_order_items')
          .update({
            expected_qty: existingComponentDraft.expected_qty + addQty,
            status: 'pending_receipt',
            ...(leak.requested_by_name ? { requested_by_name: leak.requested_by_name } : {})
          })
          .eq('id', existingComponentDraft.id);
      } else {
        await supabase
          .from('purchase_order_items')
          .insert({
            po_id: leak.po_id,
            product_id: componentId,
            expected_qty: addQty,
            unit_cost: 0,
            status: 'pending_receipt',
            requested_by_name: leak.requested_by_name || null
          });
      }
    }
  }
}

export async function autoCleanupStaffDrafts(supabase: SupabaseClient) {
  const { data: drafts } = await supabase
    .from('purchase_order_items')
    .select('id, product_id, expected_qty, purchase_orders!inner(notes)')
    .eq('purchase_orders.notes', 'STAFF_DRAFT')
    .eq('status', 'pending_receipt');

  if (!drafts || drafts.length === 0) return;

  const draftIds = drafts.map((d: any) => d.id);

  const { data: sources, error: srcErr } = await supabase
    .from('procurement_request_sources')
    .select('id, quantity, purchase_order_item_id, order_id, orders!inner(status)')
    .in('purchase_order_item_id', draftIds);

  if (srcErr) {
    console.error('Skipping auto cleanup (procurement_request_sources might not exist):', srcErr.message);
    return;
  }

  if (!sources || sources.length === 0) return;

  const orderIds = Array.from(new Set(sources.map((s: any) => s.order_id)));
  
  // Fetch order items to check is_packed and get the parent product_id for bundles
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('order_id, product_id, is_packed')
    .in('order_id', orderIds);

  const { data: openIssues } = await supabase
    .from('order_issues')
    .select('order_id, product_id')
    .eq('status', 'open')
    .in('order_id', orderIds);

  // We need to know if a draft product is a component of the order item's product.
  // To keep it simple and performant, we'll fetch assembly_recipes for the order items' products.
  const orderProductIds = Array.from(new Set(orderItems?.map(oi => oi.product_id) || []));
  const { data: products } = await supabase
    .from('products')
    .select('id, assembly_recipe')
    .in('id', orderProductIds);

  const bundleToComponents = new Map<string, Set<string>>();
  products?.forEach(p => {
    const recipe = Array.isArray(p.assembly_recipe) ? p.assembly_recipe : [];
    const comps = new Set<string>();
    recipe.forEach((c: any) => {
      if (c.productId || c.component_id) comps.add(c.productId || c.component_id);
    });
    bundleToComponents.set(p.id, comps);
  });

  const sourcesToDelete: string[] = [];
  const draftUpdates = new Map<string, number>();

  for (const src of (sources as any[])) {
    const draft = drafts.find((d: any) => d.id === src.purchase_order_item_id);
    if (!draft) continue;

    let shouldDelete = false;

    if (!UNFULFILLED_STATUSES.includes(src.orders.status)) {
      shouldDelete = true;
    } else {
      // Find the specific order item that requires this draft's product
      const matchingOi = orderItems?.find(oi => {
        if (oi.order_id !== src.order_id) return false;
        if (oi.product_id === draft.product_id) return true;
        const comps = bundleToComponents.get(oi.product_id);
        return comps?.has(draft.product_id);
      });

      if (!matchingOi) {
        // If the order doesn't even contain the product (e.g. it was removed), delete the source
        shouldDelete = true;
      } else if (src.orders.status === 'Picked (with issue)') {
        // An open out-of-stock issue is the authoritative signal that the item is
        // still genuinely missing, so it must win over a stale is_packed flag. An
        // item can't be both packed and out of stock at once; is_packed lingers
        // from an earlier pack when the item is later re-picked and flagged short,
        // and the old order (is_packed check first) silently deleted the very
        // procurement request the shortage created. Keep the draft while the issue
        // is open (packed or not); only clean it up once the issue is resolved.
        const hasIssue = openIssues?.some(iss =>
          iss.order_id === src.order_id &&
          (iss.product_id === matchingOi.product_id || iss.product_id === draft.product_id)
        );
        if (!hasIssue) shouldDelete = true;
      } else if (matchingOi.is_packed) {
        // Non-issue order whose item is physically packed — already secured, don't buy.
        shouldDelete = true;
      }
    }

    if (shouldDelete) {
      sourcesToDelete.push(src.id);
      draftUpdates.set(
        src.purchase_order_item_id, 
        (draftUpdates.get(src.purchase_order_item_id) || 0) + src.quantity
      );
    }
  }

  if (sourcesToDelete.length > 0) {
    for (let i = 0; i < sourcesToDelete.length; i += 100) {
      await supabase.from('procurement_request_sources').delete().in('id', sourcesToDelete.slice(i, i + 100));
    }

    for (const [draftId, qtyToDeduct] of draftUpdates.entries()) {
      const draft = drafts.find((d: any) => d.id === draftId);
      if (!draft) continue;
      
      const newQty = draft.expected_qty - qtyToDeduct;
      
      if (newQty <= 0) {
        await supabase.from('purchase_order_items').delete().eq('id', draftId);
      } else {
        await supabase.from('purchase_order_items').update({ expected_qty: newQty }).eq('id', draftId);
      }
    }
  }
}


