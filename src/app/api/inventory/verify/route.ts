import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    const { data: reports, error: reportError } = await supabase
      .from('out_of_stock_reports')
      .select('id, snapshot_time, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (reportError) throw reportError;

    const reportIds = reports?.length > 0 ? reports.map(r => r.id) : [];

    // Fetch pending items ONLY if there are reports
    let pendingItems: any[] = [];
    const pendingProductIds = new Set();
    
    if (reportIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from('out_of_stock_items')
        .select(`
          id, report_id, product_id, reported_qty, notes, status, created_at,
          products (name, variant_name, stock_level)
        `)
        .in('report_id', reportIds)
        .eq('status', 'pending');

      if (itemsError) throw itemsError;

      // Calculate time travel stock
      for (const item of items) {
        const report = reports.find(r => r.id === item.report_id);
        if (!report) continue;

        const currentStock = item.products.stock_level;
        
        // Fetch movements AFTER the snapshot time
        const { data: movements, error: movError } = await supabase
          .from('inventory_movements')
          .select('quantity_change')
          .eq('product_id', item.product_id)
          .gt('timestamp', report.snapshot_time);
          
        if (movError) throw movError;

        const sumOfChangesSinceSnapshot = movements.reduce((acc, m) => acc + (m.quantity_change || 0), 0);
        
        const expectedStockAtSnapshot = currentStock - sumOfChangesSinceSnapshot;
        
        // If reported_qty is a positive number meaning "I need 5", that means actual physical stock was -5.
        const physicalStockAtSnapshot = -item.reported_qty;
        const discrepancy = physicalStockAtSnapshot - expectedStockAtSnapshot;

        pendingItems.push({
          id: item.id,
          productName: `${item.products.name} ${item.products.variant_name ? `[${item.products.variant_name}]` : ''}`,
          notes: item.notes,
          snapshotTime: report.snapshot_time,
          reportedQty: item.reported_qty,
          currentStock,
          expectedStockAtSnapshot,
          physicalStockAtSnapshot,
          discrepancy,
          productId: item.product_id
        });
        
        pendingProductIds.add(item.product_id);
      }
    }

    // Now fetch unreported negative stock
    // Any product where stock_level < 0 and NOT in pendingProductIds and NOT acknowledged
    const { data: negativeStock, error: nErr } = await supabase
      .from('products')
      .select('id, name, variant_name, stock_level')
      .lt('stock_level', 0)
      .eq('acknowledged_oos', false);
      
    if (nErr) throw nErr;

    const unreportedNegativeStock = negativeStock
      .filter(p => !pendingProductIds.has(p.id))
      .map(p => ({
        id: p.id,
        productName: `${p.name} ${p.variant_name ? `[${p.variant_name}]` : ''}`,
        stockLevel: p.stock_level
      }));

    return NextResponse.json({ pendingItems, unreportedNegativeStock });
  } catch (error: any) {
    console.error('Error in GET /verify:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { itemId, action, productId, discrepancyToApply, notes } = await req.json();

    if (!itemId || !action || !productId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    if (action === 'approve') {
      // 1. Get current stock to apply discrepancy
      const { data: product, error: pErr } = await supabase
        .from('products')
        .select('stock_level')
        .eq('id', productId)
        .single();
        
      if (pErr) throw pErr;

      const newStock = product.stock_level + discrepancyToApply;

      // 2. Update stock
      const { error: updErr } = await supabase
        .from('products')
        .update({ stock_level: newStock })
        .eq('id', productId);
      
      if (updErr) throw updErr;

      // 3. Log movement
      const { error: movErr } = await supabase
        .from('inventory_movements')
        .insert({
          product_id: productId,
          quantity_change: discrepancyToApply,
          movement_type: 'adjustment',
          reason: `Physical Count Verification: ${notes || 'Approved discrepancy'}`
        });

      if (movErr) console.error("Failed to log movement", movErr);
    } else if (action === 'zero_out') {
        // Feature to reset negative stock to zero
        const { error: updErr } = await supabase
          .from('products')
          .update({ stock_level: 0 })
          .eq('id', productId);
        if (updErr) throw updErr;

        // Log movement (e.g. if stock is -5, we add +5 to make it 0)
        await supabase
          .from('inventory_movements')
          .insert({
            product_id: productId,
            quantity_change: Math.abs(discrepancyToApply), // discrepancyToApply is the negative stock
            movement_type: 'adjustment',
            reason: `Manager Action: Zero out unreported negative stock.`
          });
          
        return NextResponse.json({ success: true });
    } else if (action === 'acknowledge') {
        const { error: updErr } = await supabase
          .from('products')
          .update({ acknowledged_oos: true })
          .eq('id', productId);
        if (updErr) throw updErr;
        return NextResponse.json({ success: true });
    }

    // Update item status
    const { error: stErr } = await supabase
      .from('out_of_stock_items')
      .update({ status: action === 'approve' ? 'approved' : 'rejected' })
      .eq('id', itemId);

    if (stErr) throw stErr;

    // We should ideally check if the whole report is done and mark it verified,
    // but for simplicity, we just process items individually.

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in POST /verify:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
