import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Check STAFF_DRAFT items
  const { data: drafts } = await supabase
    .from('purchase_order_items')
    .select('id, product_id, expected_qty, po_id, requested_by_name, created_at, products(id, name, sku), purchase_orders!inner(notes)')
    .eq('purchase_orders.notes', 'STAFF_DRAFT')
    .eq('status', 'pending_receipt');

  console.log(`Total STAFF_DRAFT items: ${drafts ? drafts.length : 0}`);
  (drafts || []).forEach(d => {
    const name = (d.products?.name || '').toLowerCase();
    if (name.includes('ha121') || name.includes('cyg') || name.includes('cover')) {
      console.log(`  Draft: "${d.products?.name}" | Qty: ${d.expected_qty} | By: ${d.requested_by_name}`);
    }
  });

  // Check pending receipt items (purchased)
  const { data: purchased } = await supabase
    .from('purchase_order_items')
    .select('id, product_id, expected_qty, po_id, products(id, name, sku), purchase_orders!inner(notes, status)')
    .neq('purchase_orders.notes', 'STAFF_DRAFT')
    .eq('status', 'pending_receipt');

  console.log(`\nTotal Pending Receipt (Purchased) items: ${purchased ? purchased.length : 0}`);
  (purchased || []).forEach(p => {
    const name = (p.products?.name || '').toLowerCase();
    if (name.includes('ha121') || name.includes('cyg') || name.includes('cover')) {
      console.log(`  Purchased: "${p.products?.name}" | Qty: ${p.expected_qty} | PO: ${p.po_id}`);
    }
  });

  // Check negative stock products for ha121 and cyg
  const { data: negStock } = await supabase
    .from('products')
    .select('id, name, sku, stock_level')
    .lt('stock_level', 0)
    .or('name.ilike.%ha121%,name.ilike.%cyg%');

  console.log(`\nNegative stock HA121 and CYG items (${negStock ? negStock.length : 0}):`);
  (negStock || []).forEach(ns => {
    console.log(`  * "${ns.name}" | Stock Level: ${ns.stock_level} (SKU: ${ns.sku})`);
  });
}

run();
