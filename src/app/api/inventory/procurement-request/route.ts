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

    // Create Draft Purchase Order (Jasmin's Request)
    const { data: po, error: poErr } = await supabase
      .from('purchase_orders')
      .insert({ status: 'draft' })
      .select('id')
      .single();

    if (poErr) throw poErr;

    // Insert PO items
    const itemsToInsert = requests.map((p: any) => ({
      po_id: po.id,
      product_id: p.productId,
      expected_qty: p.requestedQty,
      unit_cost: 0, // Jasmin doesn't know cost
      status: 'draft'
    }));

    const { error: itemsErr } = await supabase
      .from('purchase_order_items')
      .insert(itemsToInsert);

    if (itemsErr) throw itemsErr;

    return NextResponse.json({ success: true, poId: po.id });
  } catch (error: any) {
    console.error('Error in procurement-request POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
