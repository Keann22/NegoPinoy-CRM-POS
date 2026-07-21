import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Create a new batch from staff requests
export async function POST() {
  try {
    // 1. Find all POs that are STAFF_DRAFT
    const { data: draftPOs, error: draftErr } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('notes', 'STAFF_DRAFT');
        
    if (draftErr) throw draftErr;
    
    if (!draftPOs || draftPOs.length === 0) {
        return NextResponse.json({ error: 'No pending staff requests to batch.' }, { status: 400 });
    }
    
    const draftPoIds = draftPOs.map((po: any) => po.id);
    
    // 2. Fetch all pending items from these drafts
    const { data: draftItems, error: itemsErr } = await supabase
        .from('purchase_order_items')
        .select('id, product_id, expected_qty, received_qty, unit_cost')
        .in('po_id', draftPoIds)
        .eq('status', 'pending_receipt');
        
    if (itemsErr) throw itemsErr;
    
    if (!draftItems || draftItems.length === 0) {
        return NextResponse.json({ error: 'No pending items found in staff requests.' }, { status: 400 });
    }

    const itemIdsToDelete = draftItems.map(i => i.id);
    const oldItemToProduct = new Map(draftItems.map(i => [i.id, i.product_id]));

    // Fetch existing sources for all draft items we are about to consolidate
    const { data: oldSources, error: sourcesErr } = await supabase
        .from('procurement_request_sources')
        .select('purchase_order_item_id, order_id, quantity, created_at')
        .in('purchase_order_item_id', itemIdsToDelete);
        
    if (sourcesErr) throw sourcesErr;

    // 3. Consolidate items by product_id
    const consolidatedMap = new Map();
    for (const item of draftItems) {
        const remaining = (item.expected_qty || 0) - (item.received_qty || 0);
        if (remaining > 0) {
            if (consolidatedMap.has(item.product_id)) {
                consolidatedMap.get(item.product_id).expected_qty += remaining;
            } else {
                consolidatedMap.set(item.product_id, {
                    product_id: item.product_id,
                    expected_qty: remaining,
                    unit_cost: item.unit_cost || 0,
                    status: 'pending_receipt',
                    received_qty: 0
                });
            }
        }
    }
    
    const consolidatedItems = Array.from(consolidatedMap.values());
    if (consolidatedItems.length === 0) {
        return NextResponse.json({ error: 'No items remaining to batch.' }, { status: 400 });
    }

    // 4. Determine next batch number
    const { data: allBatches } = await supabase
        .from('purchase_orders')
        .select('notes')
        .like('notes', 'BATCH_%');
        
    let maxBatch = 0;
    if (allBatches) {
        allBatches.forEach((b: any) => {
            const match = b.notes.match(/BATCH_(\d+)/);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxBatch) maxBatch = num;
            }
        });
    }
    
    const newBatchName = `BATCH_${maxBatch + 1}`;
    
    // 5. Create New Batch PO
    const { data: newPo, error: newPoErr } = await supabase
        .from('purchase_orders')
        .insert({ status: 'pending_receipt', notes: newBatchName })
        .select('id')
        .single();
        
    if (newPoErr) throw newPoErr;
    
    // 6. Insert consolidated items
    const itemsToInsert = consolidatedItems.map(item => ({ ...item, po_id: newPo.id }));
    const { data: insertedItems, error: insErr } = await supabase
        .from('purchase_order_items')
        .insert(itemsToInsert)
        .select('id, product_id');
        
    if (insErr) throw insErr;
    
    // 6.5 Remap and insert sources
    if (oldSources && oldSources.length > 0 && insertedItems) {
        const newProductToItem = new Map(insertedItems.map((i: any) => [i.product_id, i.id]));
        const sourcesToInsert = oldSources.map((s: any) => {
            const productId = oldItemToProduct.get(s.purchase_order_item_id);
            const newItemId = newProductToItem.get(productId);
            return {
                purchase_order_item_id: newItemId,
                order_id: s.order_id,
                quantity: s.quantity,
                created_at: s.created_at
            };
        }).filter((s: any) => s.purchase_order_item_id); // Sanity check

        if (sourcesToInsert.length > 0) {
            const { error: newSourcesErr } = await supabase
                .from('procurement_request_sources')
                .insert(sourcesToInsert);
            if (newSourcesErr) throw newSourcesErr;
        }
    }
    
    // 7. Delete the old pending items from STAFF_DRAFTs
    await supabase.from('purchase_order_items').delete().in('id', itemIdsToDelete);
    
    // 8. Delete empty STAFF_DRAFT POs
    for (const draftId of draftPoIds) {
        const { count } = await supabase
            .from('purchase_order_items')
            .select('id', { count: 'exact', head: true })
            .eq('po_id', draftId);
            
        if (count === 0) {
            await supabase.from('purchase_orders').delete().eq('id', draftId);
        }
    }
    
    return NextResponse.json({ success: true, batchName: newBatchName, batchId: newPo.id });
  } catch (e: any) {
    console.error("Error creating batch:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
