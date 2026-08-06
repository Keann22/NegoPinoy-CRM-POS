import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id, short_id:id')
    .eq('status', 'Picked (with issue)');
    
  if (ordersErr) throw ordersErr;
  const orderIds = orders.map(o => o.id);
  
  if (orderIds.length === 0) return;

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('id, order_id, product_id, product_name, quantity, is_packed')
    .in('order_id', orderIds)
    .eq('is_packed', false);
  if (itemsErr) throw itemsErr;

  const { data: allIssues, error: issuesErr } = await supabase
    .from('order_issues')
    .select('order_id, product_id, status')
    .in('order_id', orderIds);
  if (issuesErr) throw issuesErr;

  const openIssueKeys = new Set(allIssues.filter(i => i.status === 'open').map(i => `${i.order_id}-${i.product_id}`));
  const resolvedIssueKeys = new Set(allIssues.filter(i => i.status === 'resolved').map(i => `${i.order_id}-${i.product_id}`));

  console.log("=== Ghost Items in 'Picked (with issue)' Orders ===");
  let foundCount = 0;
  for (const item of items) {
    const key = `${item.order_id}-${item.product_id}`;
    // If it has a resolved issue, but NO open issue, it fell victim to the ghost stock bug!
    if (resolvedIssueKeys.has(key) && !openIssueKeys.has(key)) {
      foundCount++;
      console.log(`Order: ${item.order_id.substring(0, 7).toUpperCase()} | Product: ${item.product_name} (ID: ${item.product_id})`);
    }
  }

  if (foundCount === 0) {
    console.log("No ghost items found!");
  } else {
    console.log(`Total ghost items found: ${foundCount}`);
  }
}

main().catch(console.error);
