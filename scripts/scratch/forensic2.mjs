import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // sanity: total counts, no filters
  const tables = ['order_logs', 'order_issues', 'notifications', 'purchase_orders', 'purchase_order_items', 'orders', 'inventory_movements'];
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    console.log(t, '-> count:', count, error?.message || '');
  }

  console.log('\n--- most recent order_logs (no filter) ---');
  const { data: logs, error: logErr } = await supabase
    .from('order_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  if (logErr) console.log('error', logErr.message);
  console.log(JSON.stringify(logs, null, 2));

  console.log('\n--- most recent orders (no filter) ---');
  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select('id, status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(5);
  if (ordErr) console.log('error', ordErr.message);
  console.log(JSON.stringify(orders, null, 2));

  console.log('\n--- most recent purchase_order_items (no filter, any status) ---');
  const { data: poItems, error: poErr } = await supabase
    .from('purchase_order_items')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  if (poErr) console.log('error', poErr.message);
  console.log(JSON.stringify(poItems, null, 2));

  console.log('\n--- most recent purchase_orders (no filter) ---');
  const { data: pos, error: posErr } = await supabase
    .from('purchase_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  if (posErr) console.log('error', posErr.message);
  console.log(JSON.stringify(pos, null, 2));
}

check().catch(console.error);
