import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // 1. Active staff drafts
  const { data: drafts, error: dErr } = await supabase
    .from('purchase_order_items')
    .select('id, product_id, expected_qty, po_id, status, purchase_orders!inner(notes)')
    .eq('purchase_orders.notes', 'STAFF_DRAFT')
    .eq('status', 'pending_receipt');
  console.log('Active STAFF_DRAFT items:', drafts?.length || 0, dErr?.message || '');

  // 2. Pending non-staff purchases
  const { data: purchased, error: pErr } = await supabase
    .from('purchase_order_items')
    .select('id, product_id, expected_qty, status, purchase_orders!inner(notes)')
    .neq('purchase_orders.notes', 'STAFF_DRAFT')
    .eq('status', 'pending_receipt');
  console.log('Pending (non-staff) purchase items:', purchased?.length || 0, pErr?.message || '');

  // 3. Products with negative stock (candidates that SHOULD arguably show up)
  const negStock = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await supabase
      .from('products')
      .select('id, name, variant_name, stock_level')
      .lt('stock_level', 0)
      .range(from, from + 999);
    if (error) { console.log('neg stock query error:', error.message); break; }
    if (!page || page.length === 0) break;
    negStock.push(...page);
    if (page.length < 1000) break;
  }
  console.log('Products with negative stock_level:', negStock.length);
  negStock.slice(0, 15).forEach(p => console.log(`  ${p.name}${p.variant_name ? ' ['+p.variant_name+']' : ''}: ${p.stock_level}`));

  // 4. purchase_order_items belonging to STAFF_DRAFT POs regardless of status (to see if they got marked 'received' or deleted)
  const { data: allDraftItems } = await supabase
    .from('purchase_order_items')
    .select('id, status, purchase_orders!inner(notes)')
    .eq('purchase_orders.notes', 'STAFF_DRAFT');
  console.log('ALL STAFF_DRAFT purchase_order_items (any status):', allDraftItems?.length || 0);
  const statusCounts = {};
  (allDraftItems || []).forEach(i => { statusCounts[i.status] = (statusCounts[i.status]||0)+1; });
  console.log('  status breakdown:', statusCounts);

  // 5. Recent inventory_movements from the sync action, to see if user's sync click is logged
  const { data: movements } = await supabase
    .from('inventory_movements')
    .select('product_id, quantity, reason, previous_stock, new_stock, created_at')
    .eq('reason', 'Manual Procurement Auto-Adjustment (Dashboard Sync)')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Recent Sync Stock movements:', movements?.length || 0);
  (movements || []).forEach(m => console.log(`  product ${m.product_id}: ${m.previous_stock} -> ${m.new_stock} at ${m.created_at}`));
}

check().catch(console.error);
