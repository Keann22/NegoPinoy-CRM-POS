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

    // 2. Get all draft requests from Jasmin
    const { data: drafts, error: dErr } = await supabase
      .from('purchase_order_items')
      .select('id, product_id, expected_qty, po_id')
      .eq('status', 'draft');
    if (dErr) throw dErr;

    const draftMap = new Map();
    const productIdsToFetch = new Set<string>();
    
    drafts?.forEach(d => {
      draftMap.set(d.product_id, d);
      productIdsToFetch.add(d.product_id);
    });

    // 3. Get live out of stock OR products that have a draft
    let query = supabase
      .from('products')
      .select('id, name, variant_name, stock_level, supplier_id, initial_unit_cost');
      
    if (productIdsToFetch.size > 0) {
      query = query.or(`stock_level.lt.0,id.in.(${Array.from(productIdsToFetch).map(id => `"${id}"`).join(',')})`);
    } else {
      query = query.lt('stock_level', 0);
    }

    const { data: liveOS, error: lErr } = await query;
    if (lErr) throw lErr;

    // Combine
    const osMap = new Map();
    
    for (const p of liveOS) {
      const draft = draftMap.get(p.id);
      const systemQty = Math.max(0, -p.stock_level);
      
      osMap.set(p.id, {
        productId: p.id,
        productName: `${p.name} ${p.variant_name ? `[${p.variant_name}]` : ''}`,
        neededQty: draft ? draft.expected_qty : systemQty, // Default to Jasmin's request if exists, else system
        systemQty: systemQty,
        jasminRequestedQty: draft ? draft.expected_qty : null,
        draftItemId: draft ? draft.id : null,
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
      if (p.draftItemId) {
        // Update existing draft item
        const { error: updErr } = await supabase
          .from('purchase_order_items')
          .update({
            po_id: po.id,
            supplier_id: p.supplierId || null,
            expected_qty: p.qty,
            unit_cost: p.cost || 0,
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
            unit_cost: p.cost || 0,
            status: 'pending_receipt'
          });
        if (insErr) throw insErr;
      }
    }
    
    // Clean up any remaining draft POs that are now empty
    const { data: emptyDraftPos } = await supabase
      .from('purchase_orders')
      .select('id, purchase_order_items(id)')
      .eq('status', 'draft');
      
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
