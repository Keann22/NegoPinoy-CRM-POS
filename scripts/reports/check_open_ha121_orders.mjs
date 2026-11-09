import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Query all non-completed/non-shipped/non-delivered orders
  const { data: openOrders, error } = await supabase
    .from('orders')
    .select('id, status, created_at, notes, customer_id, shipping_name, sales_person_name')
    .not('status', 'in', '("Completed","Delivered","Cancelled","Payment Received (COD)","Shipped","Returned")')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching orders:', error);
    return;
  }

  console.log(`Found ${openOrders.length} currently open/active orders.`);

  const orderIds = openOrders.map(o => o.id);

  // Fetch all items for these open orders
  const allItems = [];
  for (let i = 0; i < orderIds.length; i += 50) {
    const chunk = orderIds.slice(i, i + 50);
    const { data } = await supabase
      .from('order_items')
      .select('id, order_id, product_name, quantity, product_id, is_packed, products(id, name, sku)')
      .in('order_id', chunk);
    if (data) allItems.push(...data);
  }

  const itemsByOrder = new Map();
  allItems.forEach(i => {
    const list = itemsByOrder.get(i.order_id) || [];
    list.push(i);
    itemsByOrder.set(i.order_id, list);
  });

  const matched = [];

  openOrders.forEach(o => {
    const oItems = itemsByOrder.get(o.id) || [];
    const haItems = oItems.filter(i => (i.product_name || '').toLowerCase().includes('ha121'));
    const cygItems = oItems.filter(i => (i.product_name || '').toLowerCase().includes('cyg'));
    const coverItems = oItems.filter(i => {
      const n = (i.product_name || '').toLowerCase();
      return n.includes('cover') || n.includes('takip');
    });

    const notes = (o.notes || '').toLowerCase();
    const haInNotes = notes.includes('ha121');

    if (haItems.length > 0 || cygItems.length > 0 || haInNotes) {
      matched.push({ order: o, oItems, haItems, cygItems, coverItems });
    }
  });

  console.log(`\n=== OPEN ORDERS WITH HA121 OR CYG COVERS (${matched.length} ORDERS) ===\n`);

  matched.forEach(({ order: o, oItems, haItems, cygItems, coverItems }) => {
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`Order: #${o.id.substring(0, 7).toUpperCase()} (${o.id})`);
    console.log(`Status: ${o.status} | Created: ${o.created_at} | Sales: ${o.sales_person_name || 'N/A'} | Customer: ${o.shipping_name || 'N/A'}`);
    if (o.notes) console.log(`Notes:\n  ${o.notes}`);
    console.log(`Items:`);
    oItems.forEach(i => {
      const isTarget = haItems.includes(i) || cygItems.includes(i) || coverItems.includes(i);
      const mark = isTarget ? '👉' : '  ';
      console.log(`${mark} ${i.quantity}x "${i.product_name}" (SKU: ${i.products?.sku}) [Packed: ${i.is_packed ? 'YES' : 'NO'}]`);
    });
  });
}

run();
