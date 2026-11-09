import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: allItems } = await supabase
    .from('order_items')
    .select('id, order_id, product_name, quantity, product_id, is_packed, products(id, name, sku)')
    .or('product_name.ilike.%ha121%,product_name.ilike.%cyg%,product_name.ilike.%cover%');

  const orderIds = Array.from(new Set(allItems.map(i => i.order_id)));

  const orders = [];
  for (let i = 0; i < orderIds.length; i += 50) {
    const chunk = orderIds.slice(i, i + 50);
    const { data } = await supabase
      .from('orders')
      .select('id, status, created_at, notes, customer_id, shipping_name, sales_person_name')
      .in('id', chunk);
    if (data) orders.push(...data);
  }

  const itemsByOrder = new Map();
  allItems.forEach(i => {
    const list = itemsByOrder.get(i.order_id) || [];
    list.push(i);
    itemsByOrder.set(i.order_id, list);
  });

  const active = orders.filter(o => 
    new Date(o.created_at) >= new Date('2026-10-01T00:00:00Z') &&
    ['Processing', 'Picked', 'Picked (with issue)', 'For Pick-up', 'Photo', 'For Packing', 'Packed'].includes(o.status)
  );

  active.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  console.log(`=== RECENT ACTIVE ORDERS (OCT-NOV 2026) === (Total: ${active.length})\n`);

  active.forEach(o => {
    const oItems = itemsByOrder.get(o.id) || [];
    const haItems = oItems.filter(i => (i.product_name || '').toLowerCase().includes('ha121'));
    const covers = oItems.filter(i => {
      const n = (i.product_name || '').toLowerCase();
      return (n.includes('new covers') || n.includes('cyg') || n.includes('cover') || n.includes('takip')) && !haItems.includes(i);
    });

    console.log(`Order: #${o.id.substring(0, 7).toUpperCase()} | ${o.status} | ${o.created_at.substring(0, 10)} | Sales: ${o.sales_person_name || 'N/A'} | Customer: ${o.shipping_name || 'N/A'}`);
    if (o.notes) console.log(`  Notes: ${o.notes.replace(/\n+/g, ' ')}`);
    haItems.forEach(i => {
      console.log(`  HA121: ${i.quantity}x "${i.product_name}" (SKU: ${i.products?.sku}) [Packed: ${i.is_packed ? 'YES' : 'NO'}]`);
    });
    covers.forEach(i => {
      console.log(`  Cover: ${i.quantity}x "${i.product_name}" (SKU: ${i.products?.sku}) [Packed: ${i.is_packed ? 'YES' : 'NO'}]`);
    });
    console.log('');
  });
}

run();
