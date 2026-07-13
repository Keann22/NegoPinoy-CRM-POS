import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { batchName } = await req.json();

    if (!batchName) {
      return NextResponse.json({ error: 'batchName is required' }, { status: 400 });
    }

    // 1. Get the PO for this batch
    const { data: po, error: poErr } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('notes', batchName)
        .eq('status', 'pending_receipt')
        .single();
        
    if (poErr || !po) {
        return NextResponse.json({ error: 'Active batch not found.' }, { status: 400 });
    }

    // 2. Get all pending items in this batch
    const { data: items, error: itemsErr } = await supabase
        .from('purchase_order_items')
        .select('id, product_id, expected_qty, received_qty, unit_cost')
        .eq('po_id', po.id)
        .eq('status', 'pending_receipt');
        
    if (itemsErr) throw itemsErr;

    if (items && items.length > 0) {
        // 3. We have unbought items. Roll them over to a STAFF_DRAFT PO.
        // First, see if we already have an active STAFF_DRAFT PO
        let { data: draftPo } = await supabase
            .from('purchase_orders')
            .select('id')
            .eq('notes', 'STAFF_DRAFT')
            .eq('status', 'pending_receipt')
            .limit(1)
            .single();

        if (!draftPo) {
            const { data: newDraft, error: newDraftErr } = await supabase
                .from('purchase_orders')
                .insert({ status: 'pending_receipt', notes: 'STAFF_DRAFT' })
                .select('id')
                .single();
            if (newDraftErr) throw newDraftErr;
            draftPo = newDraft;
        }

        // 4. Create new rolled-over items
        const rollOverItems = items.map(item => {
            const remaining = (item.expected_qty || 0) - (item.received_qty || 0);
            return {
                po_id: draftPo.id,
                product_id: item.product_id,
                expected_qty: remaining,
                unit_cost: item.unit_cost,
                status: 'pending_receipt'
            };
        }).filter(item => item.expected_qty > 0);

        if (rollOverItems.length > 0) {
            const { error: insErr } = await supabase
                .from('purchase_order_items')
                .insert(rollOverItems);
            if (insErr) throw insErr;
        }

        // 5. Mark the old items as 'received' (completed for this batch)
        const oldItemIds = items.map(i => i.id);
        const { error: updItemsErr } = await supabase
            .from('purchase_order_items')
            .update({ status: 'received' })
            .in('id', oldItemIds);
        if (updItemsErr) throw updItemsErr;
    }

    // 6. Mark the Batch as completed
    const { error: updPoErr } = await supabase
        .from('purchase_orders')
        .update({ status: 'completed' })
        .eq('id', po.id);
    if (updPoErr) throw updPoErr;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Error closing batch:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
