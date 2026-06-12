import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    const { data: items, error } = await supabase
      .from('purchase_order_items')
      .select(`
        id, expected_qty, received_qty,
        products (name, variant_name)
      `)
      .eq('status', 'pending_receipt')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const mapped = items.map((i: any) => ({
      id: i.id,
      productName: `${i.products.name} ${i.products.variant_name ? `[${i.products.variant_name}]` : ''}`,
      expectedQty: i.expected_qty
    }));

    // Sort alphabetically
    mapped.sort((a, b) => a.productName.localeCompare(b.productName));

    return NextResponse.json({ pendingItems: mapped });
  } catch (error: any) {
    console.error('Error fetching pending POs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { receives } = await req.json(); // Array of { itemId, receivedQty }

    if (!receives || receives.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    for (const r of receives) {
      // 1. Get PO item
      const { data: poItem, error: poErr } = await supabase
        .from('purchase_order_items')
        .select('product_id, unit_cost')
        .eq('id', r.itemId)
        .single();
        
      if (poErr) throw poErr;

      // 2. Mark PO item as received
      const { error: updErr } = await supabase
        .from('purchase_order_items')
        .update({ received_qty: r.receivedQty, status: 'received' })
        .eq('id', r.itemId);
        
      if (updErr) throw updErr;

      // 3. Update Live Stock
      // Note: In a highly concurrent environment, RPC is better. Doing manual update here for simplicity.
      const { data: product, error: pErr } = await supabase
        .from('products')
        .select('stock_level')
        .eq('id', poItem.product_id)
        .single();
        
      if (pErr) throw pErr;

      await supabase
        .from('products')
        .update({ stock_level: product.stock_level + r.receivedQty })
        .eq('id', poItem.product_id);

      // 4. Log Movement
      await supabase
        .from('inventory_movements')
        .insert({
          product_id: poItem.product_id,
          quantity_change: r.receivedQty,
          movement_type: 'restock',
          unit_cost: poItem.unit_cost,
          reason: 'Received from PO'
        });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error processing PO receipts:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
