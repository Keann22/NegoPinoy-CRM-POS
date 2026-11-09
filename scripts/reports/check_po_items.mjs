import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Query all purchase_order_items for open POs or STAFF_DRAFT
  const { data: pos } = await supabase
    .from('purchase_orders')
    .select('id, batch_name, status, created_at')
    .in('status', ['draft', 'pending', 'open']);

  console.log(`Open POs:`, pos);

  const poIds = (pos || []).map(p => p.id);

  const { data: poi } = await supabase
    .from('purchase_order_items')
    .select('id, po_id, product_id, expected_qty, manual_qty, quantity_received, status, products(name, sku)')
    .in('po_id', poIds);

  console.log(`\nPO Items in open POs (${poi ? poi.length : 0} items):`);
  (poi || []).forEach(item => {
    const name = (item.products?.name || '').toLowerCase();
    if (name.includes('ha121') || name.includes('cyg') || name.includes('cover')) {
      console.log(`  * ${item.products?.name} | PO: ${item.po_id} | Expected: ${item.expected_qty} | Manual: ${item.manual_qty} | Status: ${item.status}`);
    }
  });

  // Also let's check procurement_request_sources
  const { data: sources } = await supabase
    .from('procurement_request_sources')
    .select('id, purchase_order_item_id, order_id, quantity')
    .limit(10);

  console.log(`Sample procurement request sources:`, sources ? sources.length : 0);
}

run();
