import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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
    console.log('API Hit! Suppliers fetched length:', suppliers?.length);

    // 2. Get all draft requests from Staff
    const { data: drafts, error: dErr } = await supabase
      .from('purchase_order_items')
      .select('id, product_id, expected_qty, po_id, purchase_orders!inner(notes)')
      .eq('purchase_orders.notes', 'STAFF_DRAFT')
      .eq('status', 'pending_receipt');
    if (dErr) throw dErr;

    const draftMap = new Map();
    const productIdsToFetch = new Set<string>();
    
    drafts?.forEach(d => {
      draftMap.set(d.product_id, d);
      productIdsToFetch.add(d.product_id);
    });

    if (productIdsToFetch.size === 0) {
      return NextResponse.json({ suppliers, groupedOutofStock: [] });
    }

    const { data: liveOS, error: lErr } = await supabase
      .from('products')
      .select('id, name, variant_name, stock_level, supplier_id, initial_unit_cost, supplier_pricing')
      .in('id', Array.from(productIdsToFetch));
    if (lErr) throw lErr;

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
        draftItemId: draft ? draft.id : null,
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
    let newPricing = currentProduct?.supplier_pricing || [];
    
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
