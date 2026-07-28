import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');

    let query = supabase
      .from('returns')
      .select('*')
      .order('created_at', { ascending: false });

    if (orderId) query = query.eq('order_id', orderId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ returns: data || [] });
  } catch (error: any) {
    console.error('Error in GET /returns:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orderId, orderItemId, productId, productName, quantity, returnType, reasonCode, notes, processedBy } = body;

    if (!orderId || !productId || !quantity || !returnType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!['restock', 'exchange', 'writeoff'].includes(returnType)) {
      return NextResponse.json({ error: 'Invalid return type' }, { status: 400 });
    }

    const { data: returnRecord, error: insertError } = await supabase
      .from('returns')
      .insert({
        order_id: orderId,
        order_item_id: orderItemId || null,
        product_id: productId,
        product_name: productName || null,
        quantity,
        return_type: returnType,
        reason_code: reasonCode || null,
        notes: notes || null,
        processed_by: processedBy || null,
      })
      .select('id')
      .single();
    if (insertError) throw insertError;

    // Only "restock" (sellable item returned) puts stock back into stock_level.
    // Exchange (reshipped) and writeoff (damaged/unsellable) leave stock_level untouched —
    // the original sale deduction already correctly reflects the item is no longer available.
    if (returnType === 'restock') {
      // A bundle holds no stock of its own — the sale decremented its
      // components (see process_order_transaction), so restoring must credit
      // those same components, not the bundle SKU. Crediting the bundle
      // directly would leave it drifting into phantom stock. Expand via the
      // product's current assembly_recipe, mirroring the sale-time explosion.
      const { data: product, error: prodErr } = await supabase
        .from('products')
        .select('name, assembly_recipe')
        .eq('id', productId)
        .single();
      if (prodErr) throw prodErr;

      const recipe = Array.isArray(product?.assembly_recipe) ? product.assembly_recipe : [];
      const targets = recipe.length > 0
        ? recipe
            .map((c: any) => ({ id: c.productId || c.component_id, qty: quantity * (c.quantity || 1), bundle: product?.name }))
            .filter((t: any) => t.id)
        : [{ id: productId, qty: quantity, bundle: null }];

      for (const t of targets) {
        const { error: rpcError } = await supabase.rpc('increment_stock', {
          p_product_id: t.id,
          qty: t.qty,
          new_unit_cost: 0,
        });
        if (rpcError) throw rpcError;

        await supabase.from('inventory_movements').insert({
          product_id: t.id,
          quantity_change: t.qty,
          movement_type: 'return',
          reason: t.bundle ? `Return to Stock: Order #${orderId} (Bundle: ${t.bundle})` : `Return to Stock: Order #${orderId}`,
        });
      }
    }

    return NextResponse.json({ success: true, returnId: returnRecord.id });
  } catch (error: any) {
    console.error('Error in POST /returns:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
