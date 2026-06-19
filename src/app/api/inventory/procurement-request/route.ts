import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
      productName: `${p.name} ${p.variant_name ? `[${p.variant_name}]` : ''}`,
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

    // 2. Fetch existing items for this PO
    const { data: existingItems, error: itemsErrFetch } = await supabase
      .from('purchase_order_items')
      .select('id, product_id, expected_qty')
      .eq('po_id', poId);
    
    if (itemsErrFetch) throw itemsErrFetch;

    const existingMap = new Map(existingItems?.map(i => [i.product_id, i]) || []);

    const itemsToInsert = [];
    
    for (const p of requests) {
      if (existingMap.has(p.productId)) {
        // Update existing item
        const existingItem = existingMap.get(p.productId)!;
        await supabase
          .from('purchase_order_items')
          .update({ expected_qty: existingItem.expected_qty + p.requestedQty })
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

    return NextResponse.json({ success: true, poId: poId });
  } catch (error: any) {
    console.error('Error in procurement-request POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
