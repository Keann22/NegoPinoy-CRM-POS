import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

import { ALL_OPEN_STATUSES, UNFULFILLED_STATUSES, migrateLeakedBundleDrafts, autoCleanupStaffDrafts } from '@/lib/services/procurement-service';

export async function GET() {
  try {
    await migrateLeakedBundleDrafts(supabase);
    await autoCleanupStaffDrafts(supabase);

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

    // 2.6 Candidate out-of-stock products that nobody has filed a draft for
    // yet. Whether one of these actually belongs on the sheet depends on
    // whether a *currently open* order is still waiting on it — checked
    // below once demand is computed. A deficit fully explained by an order
    // that already shipped/completed is a bookkeeping/cost question (the
    // purchase to true up its cost never happened), not a live blocker, so
    // it shouldn't clutter the "what do we need to buy right now" list.
    const { data: negativeStockProducts, error: negErr } = await supabase
      .from('products')
      .select('id')
      .lt('stock_level', 0);
    if (negErr) throw negErr;
    const negativeStockIds = new Set((negativeStockProducts || []).map(p => p.id));

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

    // Covers both staff-requested/purchased products and negative-stock
    // candidates, since a candidate's demand may only show up via a bundle
    // parent's order.
    const candidateIds = new Set([...Array.from(productIdsToFetch), ...Array.from(negativeStockIds)]);

    // bundleProductId -> [{ componentId, qtyPerBundle }], limited to recipes
    // that include at least one of our target components.
    const bundleToComponents = new Map<string, { componentId: string; qtyPerBundle: number }[]>();
    bundleProducts.forEach((bp: any) => {
      const recipe = Array.isArray(bp.assembly_recipe) ? bp.assembly_recipe : [];
      if (recipe.length === 0) return;
      const relevant = recipe
        .map((comp: any) => ({ componentId: comp.productId || comp.component_id, qtyPerBundle: comp.quantity || 1 }))
        .filter((c: any) => c.componentId && candidateIds.has(c.componentId));
      if (relevant.length > 0) bundleToComponents.set(bp.id, relevant);
    });
    const bundleProductIds = new Set(bundleToComponents.keys());

    // 3b. Get live order demand (how many units customers actually still
    // need), independent of whatever quantity staff manually requested. One
    // query covering both direct orders and orders for bundles that consume
    // a target component, across every open status.
    const allProductIdsForDemand = new Set([...Array.from(candidateIds), ...Array.from(bundleProductIds)]);
    const { data: demandRows, error: demandErr } = await supabase
      .from('order_items')
      .select('product_id, quantity, is_packed, orders!inner(id, status, payment_method)')
      .in('product_id', Array.from(allProductIdsForDemand))
      .in('orders.status', ALL_OPEN_STATUSES);
    if (demandErr) throw demandErr;

    // 3c. Fetch open issues to accurately gauge "Picked (with issue)" demand.
    // If an order is "Picked (with issue)", only the specific items that have
    // an open issue logged against them should be considered unfulfilled.
    // Items in that order without an issue were successfully picked and don't need buying.
    const { data: openIssues, error: issuesErr } = await supabase
      .from('order_issues')
      .select('order_id, product_id')
      .eq('status', 'open')
      .in('product_id', Array.from(allProductIdsForDemand));
    if (issuesErr) throw issuesErr;

    const openIssueKeys = new Set(openIssues?.map(i => `${i.order_id}-${i.product_id}`));

    const totalOpenDemandMap = new Map<string, number>();
    const needToBuyMap = new Map<string, number>();
    const addDemand = (productId: string, quantity: number, isUnfulfilled: boolean) => {
      totalOpenDemandMap.set(productId, (totalOpenDemandMap.get(productId) || 0) + quantity);
      if (isUnfulfilled) {
        needToBuyMap.set(productId, (needToBuyMap.get(productId) || 0) + quantity);
      }
    };
    demandRows?.forEach((row: any) => {
      if (row.orders.payment_method === 'Lay-away') {
        return; // Exclude lay-away orders from automatic system demand
      }

      let isUnfulfilled = false;
      if (row.is_packed) {
        // If the item is already physically packed, it doesn't need to be bought!
        isUnfulfilled = false;
      } else if (row.orders.status === 'Picked (with issue)') {
        // For partial fulfillment statuses, only consider the specific item unfulfilled if it has an open issue
        isUnfulfilled = openIssueKeys.has(`${row.orders.id}-${row.product_id}`);
      } else {
        isUnfulfilled = UNFULFILLED_STATUSES.includes(row.orders.status);
      }

      if (candidateIds.has(row.product_id)) {
        addDemand(row.product_id, row.quantity, isUnfulfilled);
      }
      // Expand bundle orders onto whichever target component(s) they consume.
      const components = bundleToComponents.get(row.product_id);
      components?.forEach(c => addDemand(c.componentId, row.quantity * c.qtyPerBundle, isUnfulfilled));
    });

    // Subtract pending purchases from the need to buy calculation
    // so we don't double-buy items already on order
    const pendingReceiptMap = new Map<string, number>();
    purchased?.forEach((p: any) => {
      pendingReceiptMap.set(p.product_id, (pendingReceiptMap.get(p.product_id) || 0) + p.expected_qty);
    });

    for (const [id, qty] of Array.from(needToBuyMap.entries())) {
      const pendingQty = pendingReceiptMap.get(id) || 0;
      if (pendingQty > 0) {
        const remainingNeed = qty - pendingQty;
        if (remainingNeed > 0) {
          needToBuyMap.set(id, remainingNeed);
        } else {
          needToBuyMap.delete(id);
        }
      }
    }

    // Only admit a negative-stock candidate onto the sheet if some order is
    // still genuinely unfulfilled (not yet picked) and needs it. Once a
    // picker has already secured a physical unit (Picked/Photo/Packed/For
    // Shipping/For Pick-up), buying more wouldn't help that order — it's
    // already handled — so it doesn't belong on a "what do we need to buy"
    // list even though the ledger still shows a deficit.
    negativeStockIds.forEach(id => {
      if ((needToBuyMap.get(id) || 0) > 0) {
        productIdsToFetch.add(id);
      }
    });

    // --- Reconciliation list: negative-stock products left off the
    // actionable sheet above because no order is currently unfulfilled for
    // them. These aren't a purchasing task, but the deficit is still real —
    // either it's explained by an order that already shipped/completed (a
    // cost was incurred and never recorded, an accounting debt to true up
    // eventually) or, more rarely, by no order at all (almost certainly a
    // data error, safe to reset to 0). Surfaced separately so this doesn't
    // clutter the "what to buy right now" list above.
    const VOID_STATUSES = ['Cancelled', 'Returned'];
    const reconciliationIds = Array.from(negativeStockIds).filter(id => !productIdsToFetch.has(id));
    let reconciliationItems: any[] = [];
    if (reconciliationIds.length > 0) {
      const reconciliationIdSet = new Set(reconciliationIds);
      const reconciliationBundleParentIds = Array.from(bundleToComponents.entries())
        .filter(([, comps]) => comps.some(c => reconciliationIdSet.has(c.componentId)))
        .map(([bundleId]) => bundleId);
      const idsForHistory = Array.from(new Set([...reconciliationIds, ...reconciliationBundleParentIds]));

      const { data: historyRows, error: historyErr } = await supabase
        .from('order_items')
        .select('product_id, orders!inner(id, status, created_at)')
        .in('product_id', idsForHistory);
      if (historyErr) throw historyErr;

      const explainingOrderByProduct = new Map<string, { shortOrderId: string; status: string; createdAt: string }>();
      const considerRecord = (productId: string, record: { shortOrderId: string; status: string; createdAt: string }) => {
        const existing = explainingOrderByProduct.get(productId);
        if (!existing || new Date(record.createdAt) > new Date(existing.createdAt)) {
          explainingOrderByProduct.set(productId, record);
        }
      };
      historyRows?.forEach((row: any) => {
        if (VOID_STATUSES.includes(row.orders.status)) return;
        const record = { shortOrderId: row.orders.id.substring(0, 7).toUpperCase(), status: row.orders.status, createdAt: row.orders.created_at };
        if (reconciliationIdSet.has(row.product_id)) considerRecord(row.product_id, record);
        bundleToComponents.get(row.product_id)?.forEach(c => {
          if (reconciliationIdSet.has(c.componentId)) considerRecord(c.componentId, record);
        });
      });

      const { data: reconciliationProducts, error: rpErr } = await supabase
        .from('products')
        .select('id, name, variant_name, stock_level')
        .in('id', reconciliationIds);
      if (rpErr) throw rpErr;

      reconciliationItems = (reconciliationProducts || [])
        .map((p: any) => {
          const displayName = p.variant_name && !p.name.includes(p.variant_name) ? `${p.name} [${p.variant_name}]` : p.name;
          return {
            productId: p.id,
            productName: displayName,
            currentStock: p.stock_level,
            explainingOrder: explainingOrderByProduct.get(p.id) || null,
          };
        })
        .sort((a, b) => a.currentStock - b.currentStock);
    }

    if (productIdsToFetch.size === 0) {
      return NextResponse.json({ suppliers, groupedOutofStock: [], purchasedItems: [], reconciliationItems });
    }

    const { data: liveOS, error: lErr } = await supabase
      .from('products')
      .select('id, name, variant_name, stock_level, supplier_id, initial_unit_cost, supplier_pricing')
      .in('id', Array.from(productIdsToFetch));
    if (lErr) throw lErr;

    // 3c. Fetch which order(s) prompted each staff draft request, if any were
    // recorded (see procurement_request_sources) — lets "Staff Req." trace
    // back to the order that needed it, e.g. a picker reporting a shortage
    // while picking. Tolerate the table not existing yet (pre-migration)
    // rather than breaking the whole sheet.
    const draftItemIds = (drafts || []).map(d => d.id);
    const sourceOrdersByDraftId = new Map<string, { orderId: string; shortOrderId: string; customerId: string | null; customerName: string; quantity: number; orderDate: string | null; status: string | null; paymentType: string | null; }[]>();
    if (draftItemIds.length > 0) {
      const { data: sourceRows, error: sourceErr } = await supabase
        .from('procurement_request_sources')
        .select('purchase_order_item_id, quantity, orders(id, order_date, status, payment_method, customer_id, customers(full_name))')
        .in('purchase_order_item_id', draftItemIds);
      if (sourceErr) {
        console.error('procurement_request_sources unavailable (has the migration been run?):', sourceErr.message);
      } else {
        sourceRows?.forEach((row: any) => {
          const list = sourceOrdersByDraftId.get(row.purchase_order_item_id) || [];
          list.push({
            orderId: row.orders.id,
            shortOrderId: row.orders.id.split('-')[0].toUpperCase(),
            customerId: row.orders.customer_id,
            customerName: row.orders.customers?.full_name || 'Unknown',
            quantity: row.quantity,
            orderDate: row.orders.order_date,
            status: row.orders.status,
            paymentType: row.orders.payment_method
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

    return NextResponse.json({ suppliers, groupedOutofStock: result, purchasedItems, reconciliationItems });
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
