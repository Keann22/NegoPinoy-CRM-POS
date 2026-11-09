import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Let's find:
  // 1. All orders with "New Covers (Cyg3)"
  // 2. All orders with HA121 wok + standalone cover
  // 3. All orders with notes mentioning HA121
  // 4. All active/pending orders with HA121 bundles

  // Let's first search all order_items with "New Covers" or "Cyg3" or "HA121"
  const { data: items, error } = await supabase
    .from('order_items')
    .select('id, order_id, product_name, quantity, product_id, is_packed, products(id, name, sku)')
    .or('product_name.ilike.%New Covers%,product_name.ilike.%Cyg3%,product_name.ilike.%ha121%');

  if (error) {
    console.error(error);
    return;
  }

  const orderIds = Array.from(new Set(items.map(i => i.order_id)));

  const orders = [];
  for (let i = 0; i < orderIds.length; i += 50) {
    const chunk = orderIds.slice(i, i + 50);
    const { data } = await supabase
      .from('orders')
      .select('id, status, created_at, notes, customer_id, shipping_name, sales_person_name')
      .in('id', chunk);
    if (data) orders.push(...data);
  }

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

  orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  console.log(`\n======================================================`);
  console.log(`ANALYSIS OF ALL ORDERS WITH NEW COVERS (CYG3) OR HA121`);
  console.log(`======================================================\n`);

  // Section 1: Orders that have "New Covers (Cyg3)"
  const cyg3Orders = orders.filter(o => {
    const oItems = itemsByOrder.get(o.id) || [];
    return oItems.some(i => (i.product_name || '').toLowerCase().includes('cyg3') || (i.products?.name || '').toLowerCase().includes('cyg3'));
  });

  console.log(`### 1. ORDERS WITH "NEW COVERS (CYG3)" OR "HA121 WITH TAKIP (CYG3)" (${cyg3Orders.length} total) ###\n`);
  cyg3Orders.forEach(o => {
    const oItems = itemsByOrder.get(o.id) || [];
    console.log(`Order: #${o.id.substring(0, 7).toUpperCase()} (${o.id}) | Status: ${o.status} | Date: ${o.created_at.substring(0, 10)} | Customer: ${o.shipping_name || 'N/A'} | Sales: ${o.sales_person_name || 'N/A'}`);
    if (o.notes) console.log(`   Notes: ${o.notes.replace(/\n+/g, ' ')}`);
    oItems.forEach(i => {
      const isCyg = (i.product_name || '').toLowerCase().includes('cyg') || (i.product_name || '').toLowerCase().includes('cover') || (i.product_name || '').toLowerCase().includes('ha121');
      if (isCyg) {
        console.log(`   👉 ${i.quantity}x "${i.product_name}" (SKU: ${i.products?.sku}) [Packed: ${i.is_packed ? 'YES' : 'NO'}]`);
      }
    });
    console.log('');
  });

  // Section 2: Check all active/pending orders with HA121 (any status not completed/delivered/cancelled)
  const activeHa121 = orders.filter(o => {
    const active = !['Completed', 'Delivered', 'Cancelled', 'Payment Received (COD)'].includes(o.status);
    const oItems = itemsByOrder.get(o.id) || [];
    const hasHa = oItems.some(i => (i.product_name || '').toLowerCase().includes('ha121'));
    const notesHa = (o.notes || '').toLowerCase().includes('ha121');
    return active && (hasHa || notesHa);
  });

  console.log(`\n### 2. ALL CURRENT ACTIVE/PENDING ORDERS WITH HA121 (${activeHa121.length} total) ###\n`);
  activeHa121.forEach(o => {
    const oItems = itemsByOrder.get(o.id) || [];
    console.log(`Order: #${o.id.substring(0, 7).toUpperCase()} (${o.id}) | Status: ${o.status} | Date: ${o.created_at.substring(0, 10)} | Customer: ${o.shipping_name || 'N/A'} | Sales: ${o.sales_person_name || 'N/A'}`);
    if (o.notes) console.log(`   Notes: ${o.notes.replace(/\n+/g, ' ')}`);
    oItems.forEach(i => {
      console.log(`   - ${i.quantity}x "${i.product_name}" (SKU: ${i.products?.sku}) [Packed: ${i.is_packed ? 'YES' : 'NO'}]`);
    });
    console.log('');
  });
}

run();
