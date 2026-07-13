import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const { data: liveOS, error: lErr } = await supabase
      .from('products')
      .select('id, name, variant_name, stock_level')
      .lt('stock_level', 0)
      .order('name');
      
    if (lErr) throw lErr;

    const mapped = liveOS.map(p => ({
      productId: p.id,
      productName: (p.variant_name && !p.name.includes(p.variant_name)) ? `${p.name} [${p.variant_name}]` : p.name,
      systemQty: Math.abs(p.stock_level)
    }));

    return NextResponse.json({ outOfStock: mapped });
  } catch (error: any) {
    console.error('Error in procurement-request GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { requests, requestedByName } = await req.json(); // Array of { productId, requestedQty, orderId? }

    if (!requests || requests.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    // --- Order Validation ---
    const uniqueOrderIds = new Set<string>();
    for (const r of requests) {
      if (r.orderId) uniqueOrderIds.add(r.orderId.trim());
    }

    const isFullUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

    for (const rawOrderId of uniqueOrderIds) {
      // 1. Check if the order exists (staff might type just the first 8 characters).
      // orders.id is a uuid column, so ilike (~~*) can't run directly against it —
      // it has to be cast to text first for the prefix-match case; a full UUID
      // (always what the Picker app sends) can just use an exact eq().
      const orderQuery = supabase.from('orders').select('id');
      const { data: orderData, error: orderErr } = isFullUuid(rawOrderId)
        ? await orderQuery.eq('id', rawOrderId).limit(1).maybeSingle()
        : await orderQuery.filter('id::text', 'ilike', `${rawOrderId}%`).limit(1).maybeSingle();

      if (orderErr) {
        return NextResponse.json({ error: `Database error checking order number ${rawOrderId}: ${orderErr.message}` }, { status: 500 });
      }
      if (!orderData) {
        return NextResponse.json({ error: `Order Number not found: ${rawOrderId}` }, { status: 400 });
      }

      const realOrderId = orderData.id;

      // 2. Check if the requested products for this order are actually in the order
      const requestsForThisOrder = requests.filter((r: any) => r.orderId?.trim() === rawOrderId);
      
      const { data: itemsData, error: itemsErr } = await supabase
        .from('order_items')
        .select('product_id, quantity')
        .eq('order_id', realOrderId);

      if (itemsErr) {
        return NextResponse.json({ error: `Database error checking items for order ${rawOrderId}: ${itemsErr.message}` }, { status: 500 });
      }
      
      const orderProductIds = itemsData?.map((i: any) => i.product_id) || [];
      
      // Fetch assembly recipes for all products in the order to see if the requested product is a component
      const { data: bundleData } = await supabase
        .from('products')
        .select('id, assembly_recipe')
        .in('id', orderProductIds)
        .not('assembly_recipe', 'is', null);

      // Build a map of max allowed quantity for each product in this order
      const maxAllowedMap = new Map<string, number>();
      if (itemsData) {
        for (const item of itemsData) {
          // Add the item itself
          maxAllowedMap.set(item.product_id, (maxAllowedMap.get(item.product_id) || 0) + item.quantity);
          
          // Also add its components if it's a bundle
          const bundle = bundleData?.find((b: any) => b.id === item.product_id);
          if (bundle && Array.isArray(bundle.assembly_recipe)) {
            for (const comp of bundle.assembly_recipe) {
              const compId = comp.component_id || comp.productId;
              if (compId) {
                const compQty = comp.quantity || 1;
                maxAllowedMap.set(compId, (maxAllowedMap.get(compId) || 0) + (item.quantity * compQty));
              }
            }
          }
        }
      }

      for (const r of requestsForThisOrder) {
        const pid = r.productId;
        if (!maxAllowedMap.has(pid)) {
          // fetch product name for better error message
          const { data: pData } = await supabase.from('products').select('name').eq('id', pid).single();
          const pName = pData?.name || 'Unknown Product';
          return NextResponse.json({ error: `Product "${pName}" is not part of Order ${rawOrderId} (nor is it a component of any bundle in the order).` }, { status: 400 });
        }

        const maxAllowed = maxAllowedMap.get(pid)!;
        if (r.requestedQty > maxAllowed) {
          const { data: pData } = await supabase.from('products').select('name').eq('id', pid).single();
          const pName = pData?.name || 'Unknown Product';
          return NextResponse.json({ error: `Cannot request ${r.requestedQty} of "${pName}" because Order ${rawOrderId} only requires ${maxAllowed}.` }, { status: 400 });
        }
      }

      // Update the request to use the full UUID so it saves correctly in procurement_request_sources
      for (const r of requests) {
        if (r.orderId?.trim() === rawOrderId) {
          r.orderId = realOrderId;
        }
      }
    }
    // --- End Order Validation ---

    // 1. Find existing STAFF_DRAFT
    let poId = null;
    const { data: existingPo } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('notes', 'STAFF_DRAFT')
      .eq('status', 'pending_receipt')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingPo) {
      poId = existingPo.id;
    } else {
      // Create new Draft Purchase Order
      const { data: po, error: poErr } = await supabase
        .from('purchase_orders')
        .insert({ status: 'pending_receipt', notes: 'STAFF_DRAFT' })
        .select('id')
        .single();
      if (poErr) throw poErr;
      poId = po.id;
    }

    // Fetch existing items for this PO
    const { data: existingItems, error: itemsErrFetch } = await supabase
      .from('purchase_order_items')
      .select('id, product_id, expected_qty')
      .eq('po_id', poId);
    
    if (itemsErrFetch) throw itemsErrFetch;

    const existingMap = new Map(existingItems?.map(i => [i.product_id, i]) || []);

    // 2. Expand requests to components if they have an assembly_recipe,
    // carrying the originating orderId (if any) onto each expanded component
    // so a bundle shortage still traces back to the order that needed it.
    const expandedRequests: { productId: string; requestedQty: number; orderId?: string }[] = [];
    for (const r of requests) {
      const { data: prodData } = await supabase
        .from('products')
        .select('assembly_recipe')
        .eq('id', r.productId)
        .single();

      if (prodData && prodData.assembly_recipe && Array.isArray(prodData.assembly_recipe) && prodData.assembly_recipe.length > 0) {
        for (const comp of prodData.assembly_recipe) {
          expandedRequests.push({
            productId: comp.component_id || comp.productId,
            requestedQty: r.requestedQty * (comp.quantity || 1),
            orderId: r.orderId
          });
        }
      } else {
        expandedRequests.push(r);
      }
    }

    // Combine duplicate productIds in expandedRequests
    const finalRequestsMap = new Map();
    for (const er of expandedRequests) {
      finalRequestsMap.set(er.productId, (finalRequestsMap.get(er.productId) || 0) + er.requestedQty);
    }
    const finalRequests = Array.from(finalRequestsMap.entries()).map(([productId, requestedQty]) => ({ productId, requestedQty }));

    // Per-product, per-order quantity contributed by this submission, so each
    // draft line can be attributed back to the order(s) that triggered it.
    const productOrderContributions = new Map<string, Map<string, number>>();
    for (const er of expandedRequests) {
      if (!er.orderId) continue;
      if (!productOrderContributions.has(er.productId)) productOrderContributions.set(er.productId, new Map());
      const m = productOrderContributions.get(er.productId)!;
      m.set(er.orderId, (m.get(er.orderId) || 0) + er.requestedQty);
    }

    const itemsToInsert = [];
    const purchaseOrderItemIdByProduct = new Map<string, string>();

    for (const p of finalRequests) {
      if (existingMap.has(p.productId)) {
        // Update existing item
        const existingItem = existingMap.get(p.productId)!;
        await supabase
          .from('purchase_order_items')
          .update({
            expected_qty: existingItem.expected_qty + p.requestedQty,
            status: 'pending_receipt',
            ...(requestedByName ? { requested_by_name: requestedByName } : {})
          })
          .eq('id', existingItem.id);
        purchaseOrderItemIdByProduct.set(p.productId, existingItem.id);
      } else {
        // Insert new item
        itemsToInsert.push({
          po_id: poId,
          product_id: p.productId,
          expected_qty: p.requestedQty,
          unit_cost: 0,
          status: 'pending_receipt',
          requested_by_name: requestedByName || null
        });
      }
    }

    if (itemsToInsert.length > 0) {
      const { data: insertedItems, error: itemsErr } = await supabase
        .from('purchase_order_items')
        .insert(itemsToInsert)
        .select('id, product_id');
      if (itemsErr) throw itemsErr;
      insertedItems?.forEach(i => purchaseOrderItemIdByProduct.set(i.product_id, i.id));
    }

    // Record which order(s) prompted this request, if any were provided.
    const sourceRowsToInsert = [];
    for (const [productId, contributions] of Array.from(productOrderContributions.entries())) {
      const purchaseOrderItemId = purchaseOrderItemIdByProduct.get(productId);
      if (!purchaseOrderItemId) continue;
      for (const [orderId, qty] of Array.from(contributions.entries())) {
        sourceRowsToInsert.push({ purchase_order_item_id: purchaseOrderItemId, order_id: orderId, quantity: qty });
      }
    }
    if (sourceRowsToInsert.length > 0) {
      const { error: sourceErr } = await supabase
        .from('procurement_request_sources')
        .insert(sourceRowsToInsert);
      if (sourceErr) console.error('Error recording procurement request sources:', sourceErr);
    }

    // --- Option C: Auto-adjust Negative Inventory ---
    // Fetch current stock levels for the requested products
    const productIds = finalRequests.map((r: any) => r.productId);
    const { data: productsToAdjust, error: prodErr } = await supabase
      .from('products')
      .select('id, stock_level')
      .in('id', productIds)
      .lt('stock_level', 0); // Only auto-adjust if stock is negative

    if (!prodErr && productsToAdjust && productsToAdjust.length > 0) {
      for (const p of productsToAdjust) {
        // Find the total expected qty for this product across existing + new requests
        const reqItem = finalRequests.find((r: any) => r.productId === p.id);
        if (!reqItem) continue;
        
        let newTotalExpected = reqItem.requestedQty;
        if (existingMap.has(p.id)) {
           newTotalExpected += existingMap.get(p.id)!.expected_qty;
        }

        const targetStockLevel = -newTotalExpected;
        const currentStockLevel = p.stock_level;
        const discrepancy = targetStockLevel - currentStockLevel;

        if (discrepancy !== 0) {
          // Adjust product stock
          await supabase
            .from('products')
            .update({ stock_level: targetStockLevel })
            .eq('id', p.id);

          // Log discrepancy to inventory_movements for Audit (Option C)
          await supabase
            .from('inventory_movements')
            .insert({
              product_id: p.id,
              quantity: discrepancy,
              type: 'adjustment',
              reason: 'Procurement Auto-Adjustment (Audit)',
              previous_stock: currentStockLevel,
              new_stock: targetStockLevel,
              user_id: null // System
            });
        }
      }
    }
    // ------------------------------------------------

    return NextResponse.json({ success: true, poId: poId });
  } catch (error: any) {
    console.error('Error in procurement-request POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
