import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log("Fetching order issues...");
  const { data: issues } = await supabase
    .from('order_issues')
    .select('id, order_id, product_id, status, out_of_stock_qty, orders(id, status)')
    .eq('status', 'open');
    
  console.log(`Total open order issues: ${issues?.length || 0}`);
  
  const issuesByOrderStatus = {};
  const issuesWithoutOrder = [];
  
  for (const issue of (issues || [])) {
    if (!issue.orders) {
      issuesWithoutOrder.push(issue.id);
      continue;
    }
    const status = issue.orders.status;
    issuesByOrderStatus[status] = (issuesByOrderStatus[status] || 0) + 1;
  }
  
  console.log("\nOpen Order Issues breakdown by actual Order Status:");
  console.table(issuesByOrderStatus);
  
  if (issuesWithoutOrder.length > 0) {
    console.log(`\nIssues where the order no longer exists: ${issuesWithoutOrder.length}`);
  }
}

check().catch(console.error);
