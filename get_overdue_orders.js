require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

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
    .eq('status', 'Processing')
    .neq('payment_method', 'Lay-away')
    .lt('order_date', tenDaysAgo.toISOString());

  if (error) {
    console.error("Error fetching orders:", error);
    return;
  }

  // Aggregate by staff
  const staffCounts = {};
  for (const order of orders) {
    const staffName = order.sales_person_name || 'Unknown Staff';
    if (!staffCounts[staffName]) {
      staffCounts[staffName] = 0;
    }
    staffCounts[staffName]++;
  }

  console.log("\n--- OVERDUE ORDERS SUMMARY ---");
  console.log(`Total Overdue Orders (>10 days, Processing, Non-Lay-away): ${orders.length}`);

  console.log("\nBreakdown by Staff:");
  for (const [staffName, count] of Object.entries(staffCounts)) {
    console.log(`- ${staffName}: ${count} orders`);
  }

  // Get order history/tracking for these orders to see what happened to them
  const orderIds = orders.map(o => o.id);
  const { data: logs, error: logsError } = await supabase
    .from('order_logs')
    .select('*')
    .in('order_id', orderIds)
    .order('created_at', { ascending: false });

  if (logsError) {
    console.log("Error fetching logs:", logsError);
  } else {
    // Group logs by order
    const logsByOrder = {};
    if (logs) {
      logs.forEach(t => {
        if (!logsByOrder[t.order_id]) logsByOrder[t.order_id] = [];
        logsByOrder[t.order_id].push(t);
      });
    }

    let noLogsCount = 0;
    orders.forEach(order => {
      const orderLogs = logsByOrder[order.id];
      if (!orderLogs || orderLogs.length === 0) {
        noLogsCount++;
      }
    });

    console.log(`\nHistory / Logs Context:`);
    console.log(`Out of the ${orders.length} orders:`);
    console.log(`- ${noLogsCount} orders have NO status updates or logs.`);
    console.log(`- ${orders.length - noLogsCount} orders have at least one log update.`);
    
    if (logs && logs.length > 0) {
      console.log("\nLatest logged actions for the orders with logs:");
      const recentActions = {};
      Object.values(logsByOrder).forEach(orderLogs => {
        const latest = orderLogs[0]; // because it's ordered by created_at desc
        const status = latest.status || 'Unknown Action';
        if (!recentActions[status]) recentActions[status] = 0;
        recentActions[status]++;
      });
      for (const [action, count] of Object.entries(recentActions)) {
         console.log(`- Last logged status was '${action}': ${count} orders`);
      }
      
      console.log("\nSome specific recent updates:");
      logs.slice(0, 5).forEach(log => {
        console.log(`Order ${log.order_id.substring(0,8)}... - Status set to: ${log.status} by ${log.user_name} on ${new Date(log.created_at).toLocaleDateString()}`);
      });
    }
  }
}

main();
