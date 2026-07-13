require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

  // Let's get all non-layaway orders created more than 10 days ago
  // to see what happened to the rest of the 66+ orders.
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_date,
      status,
      payment_method,
      total_amount,
      customer_id,
      sales_person_id,
      sales_person_name,
      notes
    `)
    .neq('payment_method', 'Lay-away')
    .lt('order_date', tenDaysAgo.toISOString())
    // Let's only look at orders from the last 2-3 months to avoid going too far back
    .gte('order_date', '2026-05-01T00:00:00Z');

  if (error) {
    console.error("Error fetching orders:", error);
    return;
  }

  console.log(`Found ${orders.length} total orders older than 10 days (since May 1st).`);
  
  // Aggregate by status
  const statusCounts = {};
  for (const order of orders) {
    if (!statusCounts[order.status]) {
      statusCounts[order.status] = 0;
    }
    statusCounts[order.status]++;
  }

  console.log("\nSummary of what happened to all older orders (Status Breakdown):");
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`- ${status}: ${count} orders`);
  }

  // Focus on the ones that are NOT processing (the ones that got resolved)
  const resolvedOrders = orders.filter(o => o.status !== 'Processing');
  console.log(`\nThere are ${resolvedOrders.length} orders that are no longer "Processing" (i.e. resolved/moved forward).`);
  
  const staffCounts = {};
  for (const order of resolvedOrders) {
    const staffName = order.sales_person_name || 'Unknown Staff';
    if (!staffCounts[staffName]) {
      staffCounts[staffName] = 0;
    }
    staffCounts[staffName]++;
  }
  
  console.log("\nStaff who handled the RESOLVED/MOVED orders:");
  for (const [staffName, count] of Object.entries(staffCounts)) {
    console.log(`- ${staffName}: ${count} orders`);
  }
}

main();
