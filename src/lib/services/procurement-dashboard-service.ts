import { SupabaseClient } from '@supabase/supabase-js';
import { migrateLeakedBundleDrafts, autoCleanupStaffDrafts } from './procurement-service';
import { calculateProcurementDemand } from './procurement-demand-service';
import { getNegativeStockReconciliationItems } from './procurement-reconciliation-service';

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
  const initialProductIdsToFetch = new Set<string>();

  drafts?.forEach((d: any) => {
    draftMap.set(d.product_id, d);
    initialProductIdsToFetch.add(d.product_id);
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
    initialProductIdsToFetch.add(p.product_id);
  });

  // 3. Calculate live order demand, bundle expansion, and candidates
  const {
    productIdsToFetch,
    totalOpenDemandMap,
    needToBuyMap,
    bundleToComponents,
    negativeStockIds,
  } = await calculateProcurementDemand(supabase, initialProductIdsToFetch, purchased || []);

  // 4. Calculate negative stock reconciliation
  const reconciliationItems = await getNegativeStockReconciliationItems(
    supabase,
    negativeStockIds,
    productIdsToFetch,
    bundleToComponents
  );

  if (productIdsToFetch.size === 0) {
    return { suppliers, groupedOutofStock: [], purchasedItems: [], reconciliationItems };
  }

  // 5. Fetch live product data for items needing procurement / purchased
  const { data: liveOS, error: lErr } = await supabase
    .from('products')
    .select('id, name, variant_name, stock_level, supplier_id, initial_unit_cost, supplier_pricing, parent_id')
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
          paymentType: row.orders.payment_method,
        });
        sourceOrdersByDraftId.set(row.purchase_order_item_id, list);
      });
    }
  }

  // Resolve supplier fallback for candidate products missing supplier_id or supplier_pricing
  const needsParentLookup = (liveOS || []).filter(
    (p: any) => p.parent_id && (!p.supplier_id || !p.supplier_pricing || p.supplier_pricing.length === 0)
  );
  const parentIdsToLookup = Array.from(
    new Set(needsParentLookup.map((p: any) => p.parent_id))
  );

  const parentSupplierMap = new Map<string, { supplierId: string | null; unitCost: number; pricing: any[] }>();
  if (parentIdsToLookup.length > 0) {
    const { data: parents } = await supabase
      .from('products')
      .select('id, supplier_id, initial_unit_cost, supplier_pricing')
      .in('id', parentIdsToLookup);

    parents?.forEach((parent: any) => {
      const supId = parent.supplier_id || parent.supplier_pricing?.find((sp: any) => sp.supplierId)?.supplierId || null;
      parentSupplierMap.set(parent.id, {
        supplierId: supId,
        unitCost: Number(parent.initial_unit_cost) || 0,
        pricing: parent.supplier_pricing || [],
      });
    });
  }

  const healingUpdates: PromiseLike<any>[] = [];
  const osMap = new Map();

  for (const p of liveOS) {
    const draft = draftMap.get(p.id);
    const systemQty = Math.max(0, -p.stock_level);

    const pricingSupplierId = p.supplier_pricing?.find((sp: any) => sp.supplierId)?.supplierId;
    const parentInfo = p.parent_id ? parentSupplierMap.get(p.parent_id) : null;
    const resolvedSupplierId = p.supplier_id || pricingSupplierId || parentInfo?.supplierId || null;

    if (!p.supplier_id && resolvedSupplierId) {
      healingUpdates.push(
        supabase.from('products').update({ supplier_id: resolvedSupplierId }).eq('id', p.id)
      );
    }

    let matchedCost = p.initial_unit_cost || parentInfo?.unitCost || 0;
    let matchedSupplierCode: string | null = null;
    const effectivePricing = (p.supplier_pricing && p.supplier_pricing.length > 0) ? p.supplier_pricing : (parentInfo?.pricing || []);
    if (resolvedSupplierId && effectivePricing.length > 0) {
      const sup = suppliers.find((s: any) => s.id === resolvedSupplierId);
      const pricing = effectivePricing.find((sp: any) => sp.supplierId === resolvedSupplierId || (sup && sp.supplierName === sup.name));
      if (pricing && pricing.unitCost) {
        matchedCost = Number(pricing.unitCost);
      }
      if (pricing?.supplierCode) {
        matchedSupplierCode = pricing.supplierCode;
      }
    }
    if (!matchedSupplierCode && effectivePricing.length > 0) {
      const spWithCode = effectivePricing.find((sp: any) => sp.supplierCode);
      if (spWithCode?.supplierCode) {
        matchedSupplierCode = spWithCode.supplierCode;
      }
    }

    let displayName = p.name;
    if (p.variant_name && !p.name.includes(p.variant_name)) {
      displayName = `${p.name} [${p.variant_name}]`;
    }

    osMap.set(p.id, {
      productId: p.id,
      productName: displayName,
      supplierCode: matchedSupplierCode || null,
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
      supplierId: resolvedSupplierId,
      unitCost: matchedCost,
    });
  }

  if (healingUpdates.length > 0) {
    await Promise.allSettled(healingUpdates);
  }

  const grouped: Record<string, any> = {
    unassigned: { id: null, name: 'Unassigned (No Supplier)', items: [] },
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

  const result = Object.values(grouped).filter((g) => g.items.length > 0 || g.id === null);

  const purchasedItems = (purchased || []).map((p: any) => {
    const prod = liveOS?.find((l: any) => l.id === p.product_id);
    let displayName = prod?.name || 'Unknown Product';
    if (prod?.variant_name && !displayName.includes(prod.variant_name)) {
      displayName = `${displayName} [${prod.variant_name}]`;
    }
    const parentInfo = prod?.parent_id ? parentSupplierMap.get(prod.parent_id) : null;
    const effectivePricing = (prod?.supplier_pricing && prod.supplier_pricing.length > 0) ? prod.supplier_pricing : (parentInfo?.pricing || []);
    const supId = p.supplier_id || prod?.supplier_id || parentInfo?.supplierId || null;
    let supCode: string | null = null;
    if (supId && effectivePricing.length > 0) {
      const sup = suppliers.find((s: any) => s.id === supId);
      const pricing = effectivePricing.find((sp: any) => sp.supplierId === supId || (sup && sp.supplierName === sup.name));
      if (pricing?.supplierCode) supCode = pricing.supplierCode;
    }
    if (!supCode && effectivePricing.length > 0) {
      supCode = effectivePricing.find((sp: any) => sp.supplierCode)?.supplierCode || null;
    }
    return {
      id: p.id,
      productId: p.product_id,
      productName: displayName,
      supplierCode: supCode,
      expectedQty: p.expected_qty,
      receivedQty: p.received_qty || 0,
      unitCost: p.unit_cost,
      poId: p.po_id,
      poNotes: p.purchase_orders?.notes,
      createdAt: p.created_at,
      supplierId: supId,
    };
  });

  return { suppliers, groupedOutofStock: result, purchasedItems, reconciliationItems };
}
