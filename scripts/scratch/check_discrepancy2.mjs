import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: issues } = await supabase
    .from('order_issues')
    .select('id, order_id, product_id, out_of_stock_qty, orders(status)')
    .eq('status', 'open')
    .eq('orders.status', 'Picked (with issue)');
    
  console.log(`Open order issues for 'Picked (with issue)' orders: ${issues?.length || 0}`);
  
  let validIssues = 0;
  let totalMissingQtyInValidIssues = 0;
  
  for (const issue of (issues || [])) {
    if (!issue.orders) continue; // Skip those filtered out by the inner join simulation
    
    // Check if the order still has this product
    const { data: items } = await supabase
      .from('order_items')
      .select('quantity')
      .eq('order_id', issue.order_id)
      .eq('product_id', issue.product_id);
      
    if (items && items.length > 0) {
      validIssues++;
      totalMissingQtyInValidIssues += (issue.out_of_stock_qty || 1);
    } else {
      console.log(`Issue ${issue.id} is stale: Product ${issue.product_id} no longer in Order ${issue.order_id}`);
    }
  }
  
  console.log(`Valid issues where product is still in order: ${validIssues}`);
  console.log(`Total missing quantity from these valid issues: ${totalMissingQtyInValidIssues}`);
  
  // Now let's check the Procurement Sheet's STAFF_DRAFT total
  const { data: drafts } = await supabase
    .from('purchase_order_items')
    .select('expected_qty, purchase_orders!inner(notes)')
    .eq('purchase_orders.notes', 'STAFF_DRAFT')
    .eq('status', 'pending_receipt');
    
  let totalStaffDraftQty = 0;
  for (const d of (drafts || [])) {
    totalStaffDraftQty += d.expected_qty;
  }
  console.log(`Total Need To Buy (Staff Draft expected_qty sum): ${totalStaffDraftQty}`);
}

check().catch(console.error);
