import { SupabaseClient } from '@supabase/supabase-js';
import { 
  ALL_OPEN_STATUSES, 
  UNFULFILLED_STATUSES, 
  migrateLeakedBundleDrafts, 
  autoCleanupStaffDrafts 
} from './procurement-service';

export async function getProcurementDashboardData(supabase: SupabaseClient) {
  await migrateLeakedBundleDrafts(supabase);
  await autoCleanupStaffDrafts(supabase);

  // 1. Get all suppliers
  const { data: suppliers, error: sErr } = await supabase
    .from('suppliers')
    .select('id, name')
    .order('name');
  if (sErr) throw sErr;

  // 2. Get all draft requests from Staff
  const { data: drafts, error: dErr } = await supabase
    .from('purchase_order_items')
    .select('id, product_id, expected_qty, po_id, requested_by_name, created_at, purchase_orders!inner(notes)')
    .eq('purchase_orders.notes', 'STAFF_DRAFT')
    .eq('status', 'pending_receipt');
  if (dErr) throw dErr;

  const draftMap = new Map();
  const productIdsToFetch = new Set<string>();
  
  drafts?.forEach((d: any) => {
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

  // 2.6 Candidate out-of-stock products
  const { data: negativeStockProducts, error: negErr } = await supabase
    .from('products')
    .select('id')
    .lt('stock_level', 0);
  if (negErr) throw negErr;
  const negativeStockIds = new Set((negativeStockProducts || []).map((p: any) => p.id));

  // 2.7 Products with explicitly open order issues (missing items)
  const { data: openIssuesInitial, error: openIssuesErr } = await supabase
    .from('order_issues')
    .select('product_id')
    .eq('status', 'open');
  if (openIssuesErr) throw openIssuesErr;
  const openIssueProductIds = new Set(
    (openIssuesInitial || [])
      .map((i: any) => i.product_id)
      .filter((id: any) => id != null)
  );

  // 3a. Bundle products
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

  const allBundleIds = new Set(
    bundleProducts
      .filter((bp: any) => (Array.isArray(bp.assembly_recipe) ? bp.assembly_recipe : []).length > 0)
      .map((bp: any) => bp.id)
  );
  allBundleIds.forEach(id => negativeStockIds.delete(id));

  const candidateIds = new Set([
    ...Array.from(productIdsToFetch), 
    ...Array.from(negativeStockIds),
    ...Array.from(openIssueProductIds)
  ]);

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

  // 3b. Get live order demand
  const allProductIdsForDemand = new Set([...Array.from(candidateIds), ...Array.from(bundleProductIds)]);
  const { data: demandRows, error: demandErr } = await supabase
    .from('order_items')
    .select('product_id, quantity, is_packed, orders!inner(id, status, payment_method)')
    .in('product_id', Array.from(allProductIdsForDemand))
    .in('orders.status', ALL_OPEN_STATUSES);
  if (demandErr) throw demandErr;

  // 3c. Fetch open issues
  const { data: openIssues, error: issuesErr } = await supabase
    .from('order_issues')
    .select('order_id, product_id')
    .eq('status', 'open')
    .in('product_id', Array.from(allProductIdsForDemand));
  if (issuesErr) throw issuesErr;

  const openIssueKeys = new Set(openIssues?.map((i: any) => `${i.order_id}-${i.product_id}`));

  const totalOpenDemandMap = new Map<string, number>();
  const needToBuyMap = new Map<string, number>();
  const addDemand = (productId: string, quantity: number, isUnfulfilled: boolean) => {
    totalOpenDemandMap.set(productId, (totalOpenDemandMap.get(productId) || 0) + quantity);
    if (isUnfulfilled) {
      needToBuyMap.set(productId, (needToBuyMap.get(productId) || 0) + quantity);
    }
  };
  demandRows?.forEach((row: any) => {
    let isUnfulfilled = false;

    if (row.orders.payment_method === 'Lay-away') {
      isUnfulfilled = false; // Don't auto-buy for layaways, but they still consume stock
    } else if (row.is_packed) {
      isUnfulfilled = false;
    } else if (row.orders.status === 'Picked (with issue)') {
      isUnfulfilled = openIssueKeys.has(`${row.orders.id}-${row.product_id}`);
    } else {
      isUnfulfilled = UNFULFILLED_STATUSES.includes(row.orders.status);
    }

    if (candidateIds.has(row.product_id)) {
      addDemand(row.product_id, row.quantity, isUnfulfilled);
    }
    const components = bundleToComponents.get(row.product_id);
    components?.forEach(c => addDemand(c.componentId, row.quantity * c.qtyPerBundle, isUnfulfilled));
  });

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

  negativeStockIds.forEach(id => {
    if ((needToBuyMap.get(id) || 0) > 0) {
      productIdsToFetch.add(id);
    }
  });

  openIssueProductIds.forEach(id => {
    if ((needToBuyMap.get(id) || 0) > 0) {
      productIdsToFetch.add(id);
    }
  });

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
    return { suppliers, groupedOutofStock: [], purchasedItems: [], reconciliationItems };
  }

  const { data: liveOS, error: lErr } = await supabase
    .from('products')
    .select('id, name, variant_name, stock_level, supplier_id, initial_unit_cost, supplier_pricing')
    .in('id', Array.from(productIdsToFetch));
  if (lErr) throw lErr;

  const draftItemIds = (drafts || []).map((d: any) => d.id);
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
      neededQty: draft ? draft.expected_qty : systemQty,
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

  const result = Object.values(grouped).filter(g => g.items.length > 0 || g.id === null);

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

  return { suppliers, groupedOutofStock: result, purchasedItems, reconciliationItems };
}
