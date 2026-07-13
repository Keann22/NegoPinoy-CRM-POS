import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const productId = '0a088354-1850-4b30-a62c-6fbd4bb6332b';
const customerId = '022d79a5-58c7-4301-b5bc-1a0b7040c3c7';
const orderIds = [
  'f28e812d-f87e-4bb0-b520-9d7699fd9d2d', // A
  'aa032c78-28c2-455e-a65a-dafa44deff2c', // B
  '4c2c059d-152d-4bc9-9c16-5675b0a9fe47', // C
];

async function main() {
  // Issue messages -> issues
  const { data: issues } = await supabase.from('order_issues').select('id').in('order_id', orderIds);
  const issueIds = (issues || []).map(i => i.id);
  if (issueIds.length) {
    await supabase.from('order_issue_messages').delete().in('issue_id', issueIds);
    await supabase.from('order_issues').delete().in('id', issueIds);
  }
  console.log('Deleted issues:', issueIds.length);

  await supabase.from('returns').delete().in('order_id', orderIds);
  await supabase.from('order_logs').delete().in('order_id', orderIds);
  await supabase.from('payments').delete().in('order_id', orderIds);
  await supabase.from('order_items').delete().in('order_id', orderIds);
  await supabase.from('inventory_movements').delete().ilike('reason', '%f28e812d-f87e-4bb0-b520-9d7699fd9d2d%');
  await supabase.from('inventory_movements').delete().ilike('reason', '%aa032c78-28c2-455e-a65a-dafa44deff2c%');
  await supabase.from('inventory_movements').delete().ilike('reason', '%4c2c059d-152d-4bc9-9c16-5675b0a9fe47%');

  const { error: orderDelErr } = await supabase.from('orders').delete().in('id', orderIds);
  if (orderDelErr) console.error('order delete error:', orderDelErr);
  console.log('Deleted orders');

  await supabase.from('customers').delete().eq('id', customerId);
  console.log('Deleted test customer');

  // Restore the 3 units of stock deducted when the 3 test orders were created
  // (the "exchange" return correctly left stock untouched, so this covers the gap)
  const { error: stockErr } = await supabase.rpc('increment_stock', {
    p_product_id: productId,
    qty: 3,
    new_unit_cost: 0,
  });
  if (stockErr) console.error('stock restore error:', stockErr);
  else console.log('Restored 3 units of stock');

  const { data: product } = await supabase.from('products').select('id,name,stock_level').eq('id', productId).single();
  console.log('Final product stock:', product);
}

main().catch(e => { console.error(e); process.exit(1); });
