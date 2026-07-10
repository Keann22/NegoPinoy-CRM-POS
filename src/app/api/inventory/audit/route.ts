import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, productId, physicalCount } = body;

    if (!action || !productId) {
      return NextResponse.json({ error: 'Missing core parameters' }, { status: 400 });
    }

    if (action === 'getOnHoldCustomers') {
      // 1. Find on-hold orders holding this product
      const { data: rows, error: rowsErr } = await supabase
        .from('order_items')
        .select('order_id, quantity, orders!inner(id, status, customer_id, order_date, customers(full_name))')
        .eq('product_id', productId)
        .eq('orders.status', 'On-Hold');
      if (rowsErr) throw rowsErr;

      const onHoldRows = (rows || []) as any[];
      if (onHoldRows.length === 0) {
        return NextResponse.json({ success: true, customers: [] });
      }

      // 2. Look up the hold reason from the most recent open issue's messages, if any
      const orderIds = onHoldRows.map(r => r.order_id);
      const { data: issues } = await supabase
        .from('order_issues')
        .select('id, order_id')
        .in('order_id', orderIds)
        .eq('status', 'open');

      const issueIdToOrderId = new Map<string, string>();
      (issues || []).forEach(i => issueIdToOrderId.set(i.id, i.order_id));

      let orderIdToReason = new Map<string, string>();
      if (issues && issues.length > 0) {
        const { data: messages } = await supabase
          .from('order_issue_messages')
          .select('issue_id, message, created_at')
          .in('issue_id', issues.map(i => i.id))
          .order('created_at', { ascending: false });

        (messages || []).forEach(m => {
          const orderId = issueIdToOrderId.get(m.issue_id);
          if (orderId && !orderIdToReason.has(orderId)) {
            orderIdToReason.set(orderId, m.message);
          }
        });
      }

      const customers = onHoldRows.map(r => ({
        orderId: r.order_id,
        customerId: r.orders?.customer_id || null,
        customerName: r.orders?.customers?.full_name || 'Unknown Customer',
        quantity: r.quantity,
        holdSince: r.orders?.order_date || null,
        holdReason: orderIdToReason.get(r.order_id) || null,
      }));

      return NextResponse.json({ success: true, customers });
    }

    if (typeof physicalCount !== 'number') {
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
