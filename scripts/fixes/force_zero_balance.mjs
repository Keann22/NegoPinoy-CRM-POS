import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, balance_due')
    .eq('status', 'Payment Received (COD)')
    .gt('balance_due', 0);

  if (error) {
    console.error('Error fetching orders:', error);
    return;
  }

  console.log(`Found ${orders.length} COD orders that still have a balance due.`);

  let updated = 0;
  for (const order of orders) {
    const { error: updateError } = await supabase
      .from('orders')
      .update({ balance_due: 0 })
      .eq('id', order.id);
      
    if (!updateError) {
      updated++;
      console.log(`Forced balance_due to 0 for order ${order.id}`);
    } else {
      console.error(`Error updating order ${order.id}:`, updateError);
    }
  }

  console.log(`Successfully zeroed out the balance for ${updated} orders.`);
}

run();
