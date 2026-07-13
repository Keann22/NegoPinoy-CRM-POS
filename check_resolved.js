require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  
  // A few days ago, when there were 66 orders
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  // Fetch all orders older than 10 days that are NOT lay-away
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`id, order_date, status, sales_person_name`)
    .neq('payment_method', 'Lay-away')
    .lt('order_date', tenDaysAgo.toISOString())
    .gte('order_date', '2026-05-01T00:00:00Z');

  if (error) {
    console.error("Error:", error);
    return;
  }

  const orderIds = orders.map(o => o.id);
  
  // Get logs in the last few days for these older orders
  const { data: logs } = await supabase
    .from('order_logs')
    .select('*')
    .in('order_id', orderIds)
    .gte('created_at', threeDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  // Find orders that were recently updated
  const updatedOrderIds = new Set(logs.map(l => l.order_id));
  
  // Filter out the ones that are still processing
  const resolvedOrders = orders.filter(o => updatedOrderIds.has(o.id) && o.status !== 'Processing');
  
  console.log(`Found ${resolvedOrders.length} older orders that were recently updated and moved OUT of 'Processing'.`);
  
  const statusCounts = {};
  const staffCounts = {};
  
  for (const o of resolvedOrders) {
    if (!statusCounts[o.status]) statusCounts[o.status] = 0;
    statusCounts[o.status]++;
    
    // Find the latest log to see who did it
    const orderLogs = logs.filter(l => l.order_id === o.id);
    const lastLog = orderLogs[0];
    const staff = lastLog ? lastLog.user_name : o.sales_person_name;
    
    if (!staffCounts[staff]) staffCounts[staff] = 0;
    staffCounts[staff]++;
  }

  console.log("\nWhat happened to them (New Statuses):");
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`- ${status}: ${count} orders`);
  }

  console.log("\nStaff who updated them:");
  for (const [staff, count] of Object.entries(staffCounts)) {
    console.log(`- ${staff}: ${count} orders`);
  }
}

main();
