import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Query order_items that match ha121 or cyg
  const { data: targetItems, error: itmErr } = await supabase
    .from('order_items')
    .select('id, order_id, product_name, quantity, product_id, is_packed, products(id, name, sku)')
    .or('product_name.ilike.%ha121%,product_name.ilike.%cyg%');

  if (itmErr) {
    console.error('itmErr:', itmErr);
    return;
  }

  const orderIds = Array.from(new Set(targetItems.map(i => i.order_id)));
  console.log(`Found ${targetItems.length} target items across ${orderIds.length} orders.`);

  // Chunk orderIds into batches of 50
  const orders = [];
  for (let i = 0; i < orderIds.length; i += 50) {
    const chunk = orderIds.slice(i, i + 50);
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, created_at, notes, customer_id, shipping_name')
      .in('id', chunk);
    if (error) console.error(error);
    else orders.push(...data);
  }

  // Sort orders descending by created_at
  orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Also get full order items for these orders so we see the whole basket
  const allItems = [];
  for (let i = 0; i < orderIds.length; i += 50) {
    const chunk = orderIds.slice(i, i + 50);
    const { data, error } = await supabase
      .from('order_items')
      .select('id, order_id, product_name, quantity, product_id, is_packed, products(id, name, sku)')
      .in('order_id', chunk);
    if (error) console.error(error);
    else allItems.push(...data);
  }

  const itemsByOrder = new Map();
  allItems.forEach(i => {
    const list = itemsByOrder.get(i.order_id) || [];
    list.push(i);
    itemsByOrder.set(i.order_id, list);
  });

  // Filter orders that have ha121
  const ha121Orders = orders.filter(o => {
    const oItems = itemsByOrder.get(o.id) || [];
    return oItems.some(i => 
      (i.product_name || '').toLowerCase().includes('ha121') || 
      (i.products?.name || '').toLowerCase().includes('ha121')
    );
  });

  console.log(`\n=== TOTAL ORDERS WITH HA121: ${ha121Orders.length} ===\n`);

  for (const o of ha121Orders) {
    const oItems = itemsByOrder.get(o.id) || [];
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`ORDER ID: ${o.id} | Status: ${o.status} | Date: ${o.created_at} | Customer: ${o.shipping_name || 'N/A'}`);
    if (o.notes) console.log(`Notes: ${o.notes.trim()}`);
    console.log(`Items in this order:`);
    oItems.forEach(i => {
      const isPacked = i.is_packed ? '[PACKED]' : '[UNPACKED]';
      console.log(`  * ${i.quantity}x "${i.product_name}" | Canonical: "${i.products?.name || 'N/A'}" | SKU: ${i.products?.sku || 'N/A'} ${isPacked}`);
    });
  }
}

run();
