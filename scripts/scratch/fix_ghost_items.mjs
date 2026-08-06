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
    .select('id, order_id, product_id, status')
    .in('order_id', orderIds);
  if (issuesErr) throw issuesErr;

  const openIssueKeys = new Set(allIssues.filter(i => i.status === 'open').map(i => `${i.order_id}-${i.product_id}`));
  
  // Find the exact issue IDs that are resolved but shouldn't be
  const issuesToReopen = [];

  for (const item of items) {
    const key = `${item.order_id}-${item.product_id}`;
    if (!openIssueKeys.has(key)) {
      // Find the resolved issue for this
      const resolvedIssue = allIssues.find(i => i.status === 'resolved' && i.order_id === item.order_id && i.product_id === item.product_id);
      if (resolvedIssue) {
        issuesToReopen.push(resolvedIssue.id);
      }
    }
  }

  if (issuesToReopen.length === 0) {
    console.log("No ghost items found to fix!");
    return;
  }

  console.log(`Re-opening ${issuesToReopen.length} ghost issues...`);

  const { error: updateErr } = await supabase
    .from('order_issues')
    .update({ status: 'open' })
    .in('id', issuesToReopen);

  if (updateErr) throw updateErr;

  console.log("Successfully re-opened issues!");
}

main().catch(console.error);
