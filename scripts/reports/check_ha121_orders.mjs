import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: items, error } = await supabase
    .from('order_items')
    .select('order_id, product_name, quantity, product_id, products(name, sku)')
    .or('product_name.ilike.%ha121%,product_name.ilike.%cyg%');

  if (error) {
    console.error(error);
    return;
  }

  const orderIds = Array.from(new Set(items.map(i => i.order_id)));
  console.log(`Total matching order IDs: ${orderIds.length}`);

  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, status, created_at, notes, customer_id, shipping_name')
    .in('id', orderIds)
    .order('created_at', { ascending: false });

  if (oErr) {
    console.error(oErr);
    return;
  }

  const { data: allItems } = await supabase
    .from('order_items')
    .select('order_id, product_name, quantity, product_id, products(name, sku)')
    .in('order_id', orderIds);

  const itemsByOrder = new Map();
  allItems.forEach(item => {
    const list = itemsByOrder.get(item.order_id) || [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  });

  console.log('\n--- ACTIVE / RECENT ORDERS WITH HA121 OR CYG COVERS ---');
  orders.forEach(o => {
    const oItems = itemsByOrder.get(o.id) || [];
    const hasHa121 = oItems.some(i => (i.product_name || '').toLowerCase().includes('ha121') || (i.products?.name || '').toLowerCase().includes('ha121'));
    if (!hasHa121) return;

    console.log(`\nOrder: ${o.id} | Status: ${o.status} | Created: ${o.created_at} | Customer: ${o.shipping_name || 'N/A'}`);
    if (o.notes) console.log(`  Notes: ${o.notes}`);
    oItems.forEach(i => {
      console.log(`  - ${i.quantity}x "${i.product_name}" (Product ID: ${i.product_id}, SKU: ${i.products?.sku || 'N/A'})`);
    });
  });
}
run();
