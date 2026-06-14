import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, productId, physicalCount } = body;

    if (!action || !productId || typeof physicalCount !== 'number') {
      return NextResponse.json({ error: 'Missing core parameters' }, { status: 400 });
    }

    if (action === 'verify') {
      const { snapshotTime } = body;
      if (!snapshotTime) return NextResponse.json({ error: 'Missing snapshot time' }, { status: 400 });

      // 1. Fetch current live stock
      const { data: product, error: pErr } = await supabase
        .from('products')
        .select('stock_level')
        .eq('id', productId)
        .single();
      if (pErr) throw pErr;

      const currentStock = product.stock_level;

      // 2. Fetch movements AFTER the snapshot time
      const { data: movements, error: movErr } = await supabase
        .from('inventory_movements')
        .select('quantity_change')
        .eq('product_id', productId)
        .gt('timestamp', snapshotTime);
        
      if (movErr) throw movErr;

      // 3. Time travel math
      const sumOfChangesSinceSnapshot = movements.reduce((acc, m) => acc + (m.quantity_change || 0), 0);
      const expectedStockAtSnapshot = currentStock - sumOfChangesSinceSnapshot;
      
      // JIT physical logic: expected physical is never negative
      const expectedPhysicalStock = Math.max(0, expectedStockAtSnapshot);

      const discrepancy = physicalCount - expectedPhysicalStock;

      return NextResponse.json({
        success: true,
        expectedPhysicalStock,
        discrepancy,
        isMatch: discrepancy === 0
      });

    } else if (action === 'apply') {
      const { discrepancyToApply, reasonCode, notes } = body;
      if (typeof discrepancyToApply !== 'number') return NextResponse.json({ error: 'Missing discrepancy to apply' }, { status: 400 });

      // 1. Fetch live stock immediately before updating to prevent race conditions
      const { data: product, error: pErr } = await supabase
        .from('products')
        .select('stock_level')
        .eq('id', productId)
        .single();
      if (pErr) throw pErr;

      // We apply the exact numerical discrepancy to the CURRENT live stock.
      // Example: We are missing 2 woks. discrepancyToApply = -2.
      // If live stock is 5, it becomes 3. If live stock is -5, it becomes -7.
      const newStockLevel = product.stock_level + discrepancyToApply;

      // 2. Update stock
      const { error: updErr } = await supabase
        .from('products')
        .update({ stock_level: newStockLevel })
        .eq('id', productId);
      if (updErr) throw updErr;

      // 3. Log movement
      const fullReason = reasonCode 
        ? `Audit Discrepancy (${reasonCode}): ${notes || 'No extra notes'}`
        : `Physical Count Audit: ${notes || 'Adjusted directly by inventory staff'}`;

      const { error: movErr } = await supabase
        .from('inventory_movements')
        .insert({
          product_id: productId,
          quantity_change: discrepancyToApply,
          movement_type: 'adjustment',
          reason: fullReason
        });

      if (movErr) console.error("Failed to log movement", movErr);

      return NextResponse.json({ success: true, newStockLevel });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    console.error('Error in POST /audit:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
