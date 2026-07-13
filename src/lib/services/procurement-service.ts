import { SupabaseClient } from '@supabase/supabase-js';

export const ALL_OPEN_STATUSES = [
  'Pending Payment', 'Processing', 'Picked', 'Picked (with issue)', 'Photo',
  'Packed', 'For Shipping', 'For Pick-up', 'On-Hold', 'Waiting for Stock',
];

// Statuses where the item has NOT yet been physically found and secured by a
// picker. Once an order reaches Picked/Photo/Packed/For Shipping/For Pick-up,
// a staff member already pulled a real unit for it — buying more wouldn't
// help that order. This narrower set is what actually needs purchasing.
export const UNFULFILLED_STATUSES = [
  'Pending Payment', 'Processing', 'Picked (with issue)', 'On-Hold', 'Waiting for Stock',
];

/**
 * Distinct sales reps who own an order still waiting on this product (i.e. the
 * order hasn't been picked yet, so it actually depends on more stock arriving).
 * Used to ping the specific people affected by a shortage/discrepancy for a
 * product, not just the Admin/Inventory leads who handle purchasing generally.
 */
export async function getAffectedSalesReps(supabase: SupabaseClient, productId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('order_items')
    .select('quantity, orders!inner(status, sales_person_name)')
    .eq('product_id', productId)
    .in('orders.status', UNFULFILLED_STATUSES);

  if (error) {
    console.error('Error fetching affected sales reps:', error);
    return [];
  }

  const names = new Set<string>();
  (data || []).forEach((row: any) => {
    const name = row.orders?.sales_person_name;
    if (name) names.add(name);
  });
  return Array.from(names);
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
    .select('id, expected_qty, purchase_orders!inner(notes)')
    .eq('purchase_orders.notes', 'STAFF_DRAFT')
    .eq('status', 'pending_receipt');

  if (!drafts || drafts.length === 0) return;

  const draftIds = drafts.map((d: any) => d.id);

  const { data: sources, error: srcErr } = await supabase
    .from('procurement_request_sources')
    .select('id, quantity, purchase_order_item_id, orders!inner(status)')
    .in('purchase_order_item_id', draftIds);

  if (srcErr) {
    console.error('Skipping auto cleanup (procurement_request_sources might not exist):', srcErr.message);
    return;
  }

  if (!sources || sources.length === 0) return;

  const sourcesToDelete: string[] = [];
  const draftUpdates = new Map<string, number>();

  for (const src of (sources as any[])) {
    if (!UNFULFILLED_STATUSES.includes(src.orders.status)) {
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
