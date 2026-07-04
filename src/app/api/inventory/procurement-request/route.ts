import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
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
    const { requests } = await req.json(); // Array of { productId, requestedQty }

    if (!requests || requests.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    // 1. Find existing STAFF_DRAFT
    let poId = null;
    const { data: existingPo, error: existErr } = await supabase
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

    // 2. Expand requests to components if they have an assembly_recipe
    const expandedRequests = [];
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
            requestedQty: r.requestedQty * (comp.quantity || 1)
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

    const itemsToInsert = [];
    
    for (const p of finalRequests) {
      if (existingMap.has(p.productId)) {
        // Update existing item
        const existingItem = existingMap.get(p.productId)!;
        await supabase
          .from('purchase_order_items')
          .update({ 
            expected_qty: existingItem.expected_qty + p.requestedQty,
            status: 'pending_receipt' 
          })
          .eq('id', existingItem.id);
      } else {
        // Insert new item
        itemsToInsert.push({
          po_id: poId,
          product_id: p.productId,
          expected_qty: p.requestedQty,
          unit_cost: 0,
          status: 'pending_receipt'
        });
      }
    }

    if (itemsToInsert.length > 0) {
      const { error: itemsErr } = await supabase
        .from('purchase_order_items')
        .insert(itemsToInsert);
      if (itemsErr) throw itemsErr;
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
