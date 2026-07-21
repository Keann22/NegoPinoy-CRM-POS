import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log('Fetching STAFF_DRAFT PO...');
  const { data: pos } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('notes', 'STAFF_DRAFT')
    .eq('status', 'pending_receipt');
    
  if (!pos || pos.length === 0) {
    console.log('No STAFF_DRAFT PO found.');
    return;
  }

  let fixedCount = 0;

  for (const po of pos) {
    const { data: items } = await supabase
      .from('purchase_order_items')
      .select('id, product_id, expected_qty')
      .eq('po_id', po.id);
    
    for (const item of (items || [])) {
      const { data: sources } = await supabase
        .from('procurement_request_sources')
        .select('order_id, quantity')
        .eq('purchase_order_item_id', item.id);
      
      let trueQty = 0;
      
      // We should deduplicate sources by order_id in case there are duplicates
      const uniqueSources = new Map();
      if (sources && sources.length > 0) {
        for (const s of sources) {
          uniqueSources.set(s.order_id, s.quantity); // Keep the latest quantity per order
        }
        trueQty = Array.from(uniqueSources.values()).reduce((sum, qty) => sum + qty, 0);
      }

      if (trueQty > 0 && trueQty !== item.expected_qty) {
        console.log(`Fixing item ${item.product_id} (ID: ${item.id}) from ${item.expected_qty} to ${trueQty}`);
        await supabase.from('purchase_order_items').update({ expected_qty: trueQty }).eq('id', item.id);
        fixedCount++;
        
        // Let's also clean up duplicates in procurement_request_sources if they exist
        if (sources.length > uniqueSources.size) {
            console.log(`  -> Found duplicate source rows, cleaning up...`);
            await supabase.from('procurement_request_sources').delete().eq('purchase_order_item_id', item.id);
            const toInsert = Array.from(uniqueSources.entries()).map(([order_id, quantity]) => ({
                purchase_order_item_id: item.id,
                order_id,
                quantity
            }));
            await supabase.from('procurement_request_sources').insert(toInsert);
        }
      }
    }
  }
  
  console.log(`Fixed ${fixedCount} items! Done.`);
}
run();
