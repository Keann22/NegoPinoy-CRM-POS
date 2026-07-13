require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  // Get all logs in the last 3 days
  const { data: recentLogs, error } = await supabase
    .from('order_logs')
    .select('order_id, status, user_name, created_at')
    .gte('created_at', threeDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  if (error || !recentLogs) {
    console.log("No logs or error:", error);
    return;
  }
  
  const updatedOrderIds = [...new Set(recentLogs.map(l => l.order_id))];

  // Fetch these orders to see if they were older than 10 days
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

  const { data: orders } = await supabase
    .from('orders')
    .select('id, status, order_date')
    .in('id', updatedOrderIds)
    .lt('order_date', tenDaysAgo.toISOString())
    .neq('status', 'Processing')
    .neq('payment_method', 'Lay-away');
    
  if (!orders || orders.length === 0) {
     console.log("No older orders were moved out of processing in the last 3 days.");
     return;
  }

  console.log(`Found ${orders.length} older orders that were recently removed from the overdue list.`);
  
  const statusCounts = {};
  const staffCounts = {};
  
  for (const o of orders) {
    if (!statusCounts[o.status]) statusCounts[o.status] = 0;
    statusCounts[o.status]++;
    
    // Find the latest log to see who did it
    const orderLogs = recentLogs.filter(l => l.order_id === o.id);
    const lastLog = orderLogs[0];
    const staff = lastLog ? lastLog.user_name : 'Unknown';
    
    if (!staffCounts[staff]) staffCounts[staff] = 0;
    staffCounts[staff]++;
  }

  console.log("\nWhat happened to them (Current Statuses):");
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`- Changed to ${status}: ${count} orders`);
  }

  console.log("\nStaff who updated them:");
  for (const [staff, count] of Object.entries(staffCounts)) {
    console.log(`- ${staff}: ${count} orders updated`);
  }
}

main();
