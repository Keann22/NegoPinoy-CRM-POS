import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { productId, staffRequestedQty } = await req.json();

    if (!productId || typeof staffRequestedQty !== 'number') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const targetStockLevel = -staffRequestedQty;
    
    // Fetch current stock
    const { data: p, error: fetchErr } = await supabase
      .from('products')
      .select('stock_level')
      .eq('id', productId)
      .single();

    if (fetchErr || !p) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const currentStockLevel = p.stock_level;
    const discrepancy = targetStockLevel - currentStockLevel;

    if (discrepancy !== 0) {
      // Update stock
      const { error: updateErr } = await supabase
        .from('products')
        .update({ stock_level: targetStockLevel })
        .eq('id', productId);
        
      if (updateErr) throw updateErr;

      // Log movement
      const { error: logErr } = await supabase
        .from('inventory_movements')
        .insert({
          product_id: productId,
          quantity: discrepancy,
          type: 'adjustment',
          reason: 'Manual Procurement Auto-Adjustment (Dashboard Sync)',
          previous_stock: currentStockLevel,
          new_stock: targetStockLevel,
          user_id: null
        });
        
      if (logErr) console.error("Failed to log inventory movement:", logErr);
    }

    return NextResponse.json({ success: true, discrepancy });
  } catch (error: any) {
    console.error('Error in procurement sync POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
