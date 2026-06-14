import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    // 1. Get all suppliers
    const { data: suppliers, error: sErr } = await supabase
      .from('suppliers')
      .select('id, name')
      .order('name');
    if (sErr) throw sErr;

    // 2. Get live out of stock
    const { data: liveOS, error: lErr } = await supabase
      .from('products')
      .select('id, name, variant_name, stock_level, supplier_id, initial_unit_cost')
      .lt('stock_level', 0);
    if (lErr) throw lErr;

    // Combine
    const osMap = new Map();
    
    for (const p of liveOS) {
      osMap.set(p.id, {
        productId: p.id,
        productName: `${p.name} ${p.variant_name ? `[${p.variant_name}]` : ''}`,
        neededQty: Math.abs(p.stock_level),
        supplierId: p.supplier_id,
        unitCost: p.initial_unit_cost || 0
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

    return NextResponse.json({ suppliers, groupedOutofStock: result });
  } catch (error: any) {
    console.error('Error in procurement GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { purchases } = await req.json(); // Array of { productId, supplierId, qty, cost }

    if (!purchases || purchases.length === 0) {
      return NextResponse.json({ error: 'No purchases provided' }, { status: 400 });
    }

    // Create Purchase Order
    const { data: po, error: poErr } = await supabase
      .from('purchase_orders')
      .insert({ status: 'pending_receipt' })
      .select('id')
      .single();

    if (poErr) throw poErr;

    // Insert PO items
    const itemsToInsert = purchases.map((p: any) => ({
      po_id: po.id,
      product_id: p.productId,
      supplier_id: p.supplierId || null,
      expected_qty: p.qty,
      unit_cost: p.cost || 0,
      status: 'pending_receipt'
    }));

    const { error: itemsErr } = await supabase
      .from('purchase_order_items')
      .insert(itemsToInsert);

    if (itemsErr) throw itemsErr;

    return NextResponse.json({ success: true, poId: po.id });
  } catch (error: any) {
    console.error('Error in procurement POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
