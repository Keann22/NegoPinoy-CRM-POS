import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    const { data: items, error } = await supabase
      .from('purchase_order_items')
      .select(`
        id, expected_qty, received_qty,
        products (name, variant_name),
        purchase_orders!inner(notes)
      `)
      .eq('status', 'pending_receipt')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Do not filter out STAFF_DRAFT so that inventory can receive them
    // even if management hasn't finalized the amount/qty.
    const filteredItems = items;

    const mapped = filteredItems.map((i: any) => ({
      id: i.id,
      productName: (i.products.variant_name && !i.products.name.includes(i.products.variant_name)) ? `${i.products.name} [${i.products.variant_name}]` : i.products.name,
      expectedQty: i.expected_qty,
      alreadyReceivedQty: i.received_qty || 0,
      remainingQty: Math.max(0, i.expected_qty - (i.received_qty || 0)),
      batchName: i.purchase_orders?.notes === 'STAFF_DRAFT' ? 'Pending Staff Requests' : i.purchase_orders?.notes || 'Unknown Batch'
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
    const { receives, unexpectedItems } = await req.json(); 

    if ((!receives || receives.length === 0) && (!unexpectedItems || unexpectedItems.length === 0)) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    if (receives && receives.length > 0) {
      for (const r of receives) {
        // 1. Get PO item
        const { data: poItem, error: poErr } = await supabase
          .from('purchase_order_items')
          .select('product_id, unit_cost, expected_qty, received_qty')
          .eq('id', r.itemId)
          .single();
          
        if (poErr) throw poErr;

        const newReceivedQty = (poItem.received_qty || 0) + r.receivedQty;
        const newStatus = newReceivedQty >= poItem.expected_qty ? 'received' : 'pending_receipt';

        // 2. Mark PO item
        const { error: updErr } = await supabase
          .from('purchase_order_items')
          .update({ received_qty: newReceivedQty, status: newStatus })
          .eq('id', r.itemId);
          
        if (updErr) throw updErr;

        // 3. Update Live Stock safely
        const { error: updateError } = await supabase.rpc('increment_stock', {
            p_product_id: poItem.product_id,
            qty: r.receivedQty,
            new_unit_cost: poItem.unit_cost || 0
        });
        
        if (updateError) throw updateError;

        let reason = 'Received from PO';
        if (r.discrepancyReason) {
            reason = `Discrepancy reported: ${r.discrepancyReason} (Received ${r.receivedQty} out of ${poItem.expected_qty - (poItem.received_qty || 0)} remaining)`;
        }

        // 4. Log Movement
        await supabase
          .from('inventory_movements')
          .insert({
            product_id: poItem.product_id,
            quantity_change: r.receivedQty,
            movement_type: 'RESTOCK',
            unit_cost: poItem.unit_cost,
            reason: reason
          });

        // Auto-resolve any open procurement issues for this product
        const { data: issues } = await supabase
          .from('procurement_issues')
          .select('id')
          .eq('product_id', poItem.product_id)
          .eq('status', 'open');

        if (issues && issues.length > 0) {
          for (const issue of issues) {
            await supabase
              .from('procurement_issues')
              .update({ status: 'resolved' })
              .eq('id', issue.id);

            await supabase
              .from('procurement_issue_messages')
              .insert({
                issue_id: issue.id,
                sender_role: 'system',
                sender_name: 'System',
                message: 'Issue automatically resolved because the item was accepted into inventory.'
              });
          }
        }
      }
    }

    if (unexpectedItems && unexpectedItems.length > 0) {
      for (const item of unexpectedItems) {
        // 1. Update Live Stock safely
        const { error: updateError } = await supabase.rpc('increment_stock', {
            p_product_id: item.productId,
            qty: item.receivedQty,
            new_unit_cost: item.unitCost || 0
        });
        
        if (updateError) throw updateError;

        // 2. Log Movement
        await supabase
          .from('inventory_movements')
          .insert({
            product_id: item.productId,
            quantity_change: item.receivedQty,
            movement_type: 'RESTOCK',
            unit_cost: item.unitCost || 0,
            reason: 'Unexpected Delivery Item'
          });

        // Auto-resolve any open procurement issues for this product
        const { data: issues } = await supabase
          .from('procurement_issues')
          .select('id')
          .eq('product_id', item.productId)
          .eq('status', 'open');

        if (issues && issues.length > 0) {
          for (const issue of issues) {
            await supabase
              .from('procurement_issues')
              .update({ status: 'resolved' })
              .eq('id', issue.id);

            await supabase
              .from('procurement_issue_messages')
              .insert({
                issue_id: issue.id,
                sender_role: 'system',
                sender_name: 'System',
                message: 'Issue automatically resolved because the item was accepted into inventory.'
              });
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error processing PO receipts:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
