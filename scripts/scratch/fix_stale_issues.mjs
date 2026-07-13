import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const STATUSES_THAT_CLEAR_ORDER_ISSUES = [
  'Picked', 'Photo', 'Packed', 'For Shipping', 'For Pick-up',
  'Shipped', 'Completed', 'Payment Received (COD)', 'Cancelled', 'Returned'
];

async function fixStaleIssues() {
  const { data: issues } = await supabase
    .from('order_issues')
    .select('id, order_id, product_id, out_of_stock_qty, orders(status)')
    .eq('status', 'open');
    
  if (!issues) return;
  
  const idsToResolve = [];
  
  for (const issue of issues) {
    if (!issue.orders) {
      idsToResolve.push(issue.id);
      continue;
    }
    
    // Check if the order status is in a clearing state
    if (STATUSES_THAT_CLEAR_ORDER_ISSUES.includes(issue.orders.status)) {
      idsToResolve.push(issue.id);
      continue;
    }
    
    // Check if the product was removed from the order
    const { data: items } = await supabase
      .from('order_items')
      .select('id')
      .eq('order_id', issue.order_id)
      .eq('product_id', issue.product_id);
      
    if (!items || items.length === 0) {
      idsToResolve.push(issue.id);
    }
  }
  
  if (idsToResolve.length > 0) {
    console.log(`Resolving ${idsToResolve.length} stale order issues...`);
    // Supabase update with 'in' might hit limits if >1000, but we have < 150
    const { error } = await supabase
      .from('order_issues')
      .update({ status: 'resolved' })
      .in('id', idsToResolve);
      
    if (error) {
      console.error("Failed to resolve issues:", error);
    } else {
      console.log(`Successfully resolved ${idsToResolve.length} stale issues.`);
    }
  } else {
    console.log("No stale issues found to resolve.");
  }
}

fixStaleIssues().catch(console.error);
