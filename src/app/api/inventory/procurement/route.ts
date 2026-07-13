import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Every order status that still owes a customer this product (mirrors the
// "Stock Allocation Details" dialog). Stock is deducted from the ledger the
// moment an order is placed — not at pick/pack — so this full set is what
// Current Stock's deficit actually represents, and is only used to detect
// when Current Stock has drifted from that ledger truth (see hasDiscrepancy
// in procurement-item-row.tsx), not to decide how much to buy.
const ALL_OPEN_STATUSES = [
  'Pending Payment', 'Processing', 'Picked', 'Picked (with issue)', 'Photo',
  'Packed', 'For Shipping', 'For Pick-up', 'On-Hold', 'Waiting for Stock',
];

// Statuses where the item has NOT yet been physically found and secured by a
// picker. Once an order reaches Picked/Photo/Packed/For Shipping/For Pick-up,
// a staff member already pulled a real unit for it — buying more wouldn't
// help that order. This narrower set is what actually needs purchasing.
const UNFULFILLED_STATUSES = [
  'Pending Payment', 'Processing', 'Picked (with issue)', 'On-Hold', 'Waiting for Stock',
];

// A picker/staff request for a bundle product (e.g. "Wok Pan with Takip")
// normally gets expanded onto its components at request time (see
// procurement-request/route.ts) — but if the bundle's assembly_recipe wasn't
// configured yet at that moment, the draft lands on the bundle's own
// product_id instead, and nothing re-checks it afterwards. Suppliers only
// sell the raw components, so a bundle can never actually be "bought" here.
// Self-heal any such leaked draft on every load by migrating it onto its
// components, merging into whatever component draft already exists.
async function migrateLeakedBundleDrafts() {
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
    // This route can be hit by two overlapping requests (e.g. the page fires
    // an initial + a refetch nearly back-to-back). Without a lock, both would
    // read the same leak, both find no existing component draft yet, and
    // both insert their own copy — duplicating every component row. Claim the
    // leak first by deleting it: a DELETE is atomic per row in Postgres, so
    // only one of the concurrent requests actually removes it and gets a row
    // back; the loser's delete matches nothing and it skips reprocessing.
    // (purchase_order_items.status only allows 'pending_receipt'/'received',
    // so a transient status value isn't an option here.)
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

async function autoCleanupStaffDrafts() {
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
    // Delete the fulfilled source links
    // Split deletes into chunks of 100 just in case there are many
    for (let i = 0; i < sourcesToDelete.length; i += 100) {
      await supabase.from('procurement_request_sources').delete().in('id', sourcesToDelete.slice(i, i + 100));
    }

    // Update or delete the draft itself based on deducted qty
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

export async function GET(req: Request) {
  try {
    await migrateLeakedBundleDrafts();
    await autoCleanupStaffDrafts();

    // 1. Get all suppliers
    const { data: suppliers, error: sErr } = await supabase
      .from('suppliers')
      .select('id, name')
      .order('name');
    if (sErr) throw sErr;
    console.log('API Hit! Suppliers fetched length:', suppliers?.length);

    // 2. Get all draft requests from Staff
    const { data: drafts, error: dErr } = await supabase
      .from('purchase_order_items')
      .select('id, product_id, expected_qty, po_id, requested_by_name, created_at, purchase_orders!inner(notes)')
      .eq('purchase_orders.notes', 'STAFF_DRAFT')
      .eq('status', 'pending_receipt');
    if (dErr) throw dErr;

    const draftMap = new Map();
    const productIdsToFetch = new Set<string>();
    
    drafts?.forEach(d => {
      draftMap.set(d.product_id, d);
      productIdsToFetch.add(d.product_id);
    });

    // 2.5 Get all purchased items (pending receipt, NOT STAFF_DRAFT)
    const { data: purchased, error: pErr } = await supabase
      .from('purchase_order_items')
      .select(`
        id, 
        product_id, 
        expected_qty, 
        received_qty, 
        unit_cost, 
        po_id, 
        created_at, 
        supplier_id,
        purchase_orders!inner(id, notes, status)
      `)
      .neq('purchase_orders.notes', 'STAFF_DRAFT')
      .eq('status', 'pending_receipt');
      
    if (pErr) throw pErr;

    purchased?.forEach((p: any) => {
      productIdsToFetch.add(p.product_id);
    });

    if (productIdsToFetch.size === 0) {
      return NextResponse.json({ suppliers, groupedOutofStock: [], purchasedItems: [] });
    }

    const { data: liveOS, error: lErr } = await supabase
      .from('products')
      .select('id, name, variant_name, stock_level, supplier_id, initial_unit_cost, supplier_pricing')
      .in('id', Array.from(productIdsToFetch));
    if (lErr) throw lErr;

    // 3a. Bundle products consume a target component's physical stock too
    // (e.g. "Wok Pan with Takip" = 1x Wok Pan + 1x Cover) — an order for the
    // bundle never references the component's product_id directly in
    // order_items, so it has to be found via assembly_recipe and expanded.
    // assembly_recipe defaults to `[]` (not null) on most products, so a
    // `.not(is, null)` filter matches nearly the whole table and silently
    // truncates at Supabase's 1000-row cap. Page through everything instead
    // and filter for a genuinely non-empty recipe client-side.
    const bundleProducts: { id: string; assembly_recipe: any }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error: bundleErr } = await supabase
        .from('products')
        .select('id, assembly_recipe')
        .range(from, from + 999);
      if (bundleErr) throw bundleErr;
      if (!page || page.length === 0) break;
      bundleProducts.push(...page);
      if (page.length < 1000) break;
    }

    // bundleProductId -> [{ componentId, qtyPerBundle }], limited to recipes
    // that include at least one of our target components.
    const bundleToComponents = new Map<string, { componentId: string; qtyPerBundle: number }[]>();
    bundleProducts.forEach((bp: any) => {
      const recipe = Array.isArray(bp.assembly_recipe) ? bp.assembly_recipe : [];
      if (recipe.length === 0) return;
      const relevant = recipe
        .map((comp: any) => ({ componentId: comp.productId || comp.component_id, qtyPerBundle: comp.quantity || 1 }))
        .filter((c: any) => c.componentId && productIdsToFetch.has(c.componentId));
      if (relevant.length > 0) bundleToComponents.set(bp.id, relevant);
    });
    const bundleProductIds = new Set(bundleToComponents.keys());

    // 3b. Get live order demand (how many units customers actually still
    // need), independent of whatever quantity staff manually requested. One
    // query covering both direct orders and orders for bundles that consume
    // a target component, across every open status.
    const allProductIdsForDemand = new Set([...Array.from(productIdsToFetch), ...Array.from(bundleProductIds)]);
    const { data: demandRows, error: demandErr } = await supabase
      .from('order_items')
      .select('product_id, quantity, orders!inner(status)')
      .in('product_id', Array.from(allProductIdsForDemand))
      .in('orders.status', ALL_OPEN_STATUSES);
    if (demandErr) throw demandErr;

    const totalOpenDemandMap = new Map<string, number>();
    const needToBuyMap = new Map<string, number>();
    const addDemand = (productId: string, quantity: number, isUnfulfilled: boolean) => {
      totalOpenDemandMap.set(productId, (totalOpenDemandMap.get(productId) || 0) + quantity);
      if (isUnfulfilled) {
        needToBuyMap.set(productId, (needToBuyMap.get(productId) || 0) + quantity);
      }
    };
    demandRows?.forEach((row: any) => {
      const isUnfulfilled = UNFULFILLED_STATUSES.includes(row.orders.status);
      if (productIdsToFetch.has(row.product_id)) {
        addDemand(row.product_id, row.quantity, isUnfulfilled);
      }
      // Expand bundle orders onto whichever target component(s) they consume.
      const components = bundleToComponents.get(row.product_id);
      components?.forEach(c => addDemand(c.componentId, row.quantity * c.qtyPerBundle, isUnfulfilled));
    });

    // 3c. Fetch which order(s) prompted each staff draft request, if any were
    // recorded (see procurement_request_sources) — lets "Staff Req." trace
    // back to the order that needed it, e.g. a picker reporting a shortage
    // while picking. Tolerate the table not existing yet (pre-migration)
    // rather than breaking the whole sheet.
    const draftItemIds = (drafts || []).map(d => d.id);
    const sourceOrdersByDraftId = new Map<string, { orderId: string; shortOrderId: string; customerName: string; quantity: number }[]>();
    if (draftItemIds.length > 0) {
      const { data: sourceRows, error: sourceErr } = await supabase
        .from('procurement_request_sources')
        .select('purchase_order_item_id, quantity, orders(id, customers(full_name))')
        .in('purchase_order_item_id', draftItemIds);
      if (sourceErr) {
        console.error('procurement_request_sources unavailable (has the migration been run?):', sourceErr.message);
      } else {
        sourceRows?.forEach((row: any) => {
          const list = sourceOrdersByDraftId.get(row.purchase_order_item_id) || [];
          list.push({
            orderId: row.orders.id,
            shortOrderId: row.orders.id.split('-')[0].toUpperCase(),
            customerName: row.orders.customers?.full_name || 'Unknown',
            quantity: row.quantity
          });
          sourceOrdersByDraftId.set(row.purchase_order_item_id, list);
        });
      }
    }

    // Combine
    const osMap = new Map();

    for (const p of liveOS) {
      const draft = draftMap.get(p.id);
      const systemQty = Math.max(0, -p.stock_level);

      let matchedCost = p.initial_unit_cost || 0;
      if (p.supplier_id && p.supplier_pricing) {
        const sup = suppliers.find((s: any) => s.id === p.supplier_id);
        if (sup) {
          const pricing = p.supplier_pricing.find((sp: any) => sp.supplierName === sup.name);
          if (pricing && pricing.unitCost) {
            matchedCost = Number(pricing.unitCost);
          }
        }
      }
      
      let displayName = p.name;
      if (p.variant_name && !p.name.includes(p.variant_name)) {
        displayName = `${p.name} [${p.variant_name}]`;
      }

      osMap.set(p.id, {
        productId: p.id,
        productName: displayName,
        neededQty: draft ? draft.expected_qty : systemQty, // Default to Staff request if exists, else system
        systemQty: systemQty,
        currentStock: p.stock_level,
        staffRequestedQty: draft ? draft.expected_qty : null,
        requestedByName: draft ? draft.requested_by_name : null,
        requestedAt: draft ? draft.created_at : null,
        draftItemId: draft ? draft.id : null,
        sourceOrders: draft ? (sourceOrdersByDraftId.get(draft.id) || []) : [],
        totalOpenDemandQty: totalOpenDemandMap.get(p.id) || 0,
        needToBuyQty: needToBuyMap.get(p.id) || 0,
        supplierId: p.supplier_id,
        unitCost: matchedCost
      });
    }

    // Convert map to grouped array
    const grouped: Record<string, any> = {
      unassigned: { id: null, name: 'Unassigned (No Supplier)', items: [] }
    };

    for (const s of suppliers) {
      grouped[s.id] = { id: s.id, name: s.name, items: [] };
    }

    for (const item of Array.from(osMap.values())) {
      if (item.supplierId && grouped[item.supplierId]) {
        grouped[item.supplierId].items.push(item);
      } else {
        grouped.unassigned.items.push(item);
      }
    }

    // Convert to array and filter empty groups
    const result = Object.values(grouped).filter(g => g.items.length > 0 || g.id === null);

    // Format purchased items
    const purchasedItems = (purchased || []).map((p: any) => {
      const prod = liveOS?.find((l: any) => l.id === p.product_id);
      let displayName = prod?.name || 'Unknown Product';
      if (prod?.variant_name && !displayName.includes(prod.variant_name)) {
        displayName = `${displayName} [${prod.variant_name}]`;
      }
      return {
        id: p.id,
        productId: p.product_id,
        productName: displayName,
        expectedQty: p.expected_qty,
        receivedQty: p.received_qty || 0,
        unitCost: p.unit_cost,
        poId: p.po_id,
        poNotes: p.purchase_orders?.notes,
        createdAt: p.created_at,
        supplierId: p.supplier_id || prod?.supplier_id
      };
    });

    return NextResponse.json({ suppliers, groupedOutofStock: result, purchasedItems });
  } catch (error: any) {
    console.error('Error in procurement GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const VOID_ORDER_STATUSES = ['Cancelled', 'Returned'];

/**
 * This business runs just-in-time inventory: they buy a product only after a
 * customer orders it, so order_items.cost_price_at_sale gets frozen at 0 (the
 * product's cost is unknown yet) when the order is created. Recording a real
 * purchase here is the moment the true cost becomes known, so backfill it
 * onto whichever pending orders were actually waiting on this product -
 * oldest first, only fully covering an order line if the purchased quantity
 * can cover it entirely (a line's cost isn't split across two purchases).
 * Any quantity left over after covering waiting orders was bought ahead of
 * demand - it's already handled correctly by the initial_unit_cost update
 * above, since future orders snapshot whatever that value is when created.
 */
async function backfillOrderItemCosts(productId: string, purchasedQty: number, cost: number) {
  const { data: items } = await supabase
    .from('order_items')
    .select('id, quantity, order_id, orders(status, created_at)')
    .eq('product_id', productId)
    .or('cost_price_at_sale.is.null,cost_price_at_sale.eq.0');

  if (!items || items.length === 0) return;

  const waiting = items
    .filter((i: any) => i.orders && !VOID_ORDER_STATUSES.includes(i.orders.status))
    .sort((a: any, b: any) => new Date(a.orders.created_at).getTime() - new Date(b.orders.created_at).getTime());

  let remainingQty = purchasedQty;
  for (const item of waiting) {
    if (remainingQty <= 0) break;
    if (item.quantity > remainingQty) continue;

    await supabase
      .from('order_items')
      .update({ cost_price_at_sale: cost })
      .eq('id', item.id);

    remainingQty -= item.quantity;
  }
}

export async function POST(req: Request) {
  try {
    const { purchases } = await req.json(); // Array of { productId, supplierId, qty, cost, draftItemId }

    if (!purchases || purchases.length === 0) {
      return NextResponse.json({ error: 'No purchases provided' }, { status: 400 });
    }

    // Create one official Purchase Order
    const { data: po, error: poErr } = await supabase
      .from('purchase_orders')
      .insert({ status: 'pending_receipt' })
      .select('id')
      .single();

    if (poErr) throw poErr;

    for (const p of purchases) {
      const parsedCost = Number(p.cost) || 0;
      
      if (p.draftItemId) {
        // Update existing draft item
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
        // Create new item if no draft existed
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

      // Update unit cost system-wide (initial_unit_cost)
      if (parsedCost > 0) {
        await supabase
          .from('products')
          .update({ initial_unit_cost: parsedCost })
          .eq('id', p.productId);

        // Backfill the real cost onto pending orders that were waiting on this product
        await backfillOrderItemCosts(p.productId, Number(p.qty) || 0, parsedCost);
      }

      // Auto-resolve any open procurement issues for this product
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
    
    // Clean up any remaining STAFF_DRAFT POs that are now empty
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

    return NextResponse.json({ success: true, poId: po.id });
  } catch (error: any) {
    console.error('Error in procurement POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { productId, newSupplierId, unitCost } = await req.json();

    if (!productId || !newSupplierId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const { data: currentProduct } = await supabase.from('products').select('supplier_pricing, initial_unit_cost').eq('id', productId).single();
    let newPricing = currentProduct?.supplier_pricing || [];
    
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

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in procurement PATCH:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { searchParams } = new URL(req.url);
    const draftItemId = searchParams.get('draftItemId');

    if (!draftItemId) {
      return NextResponse.json({ error: 'Missing draftItemId' }, { status: 400 });
    }

    const { error } = await supabase.from('purchase_order_items').delete().eq('id', draftItemId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in procurement DELETE:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
