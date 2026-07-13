require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'Processing')
    .neq('payment_method', 'Lay-away')
    .lt('order_date', tenDaysAgo.toISOString())
    .limit(5);

  if (orders && orders.length > 0) {
     console.log("Sample keys in an overdue order:", Object.keys(orders[0]));
     console.log("Sample creator fields:", orders.map(o => ({
       id: o.id,
       sales_person_id: o.sales_person_id,
       sales_person_name: o.sales_person_name,
       user_id: o.user_id,
       created_by: o.created_by
     })));
  }
}

main();
