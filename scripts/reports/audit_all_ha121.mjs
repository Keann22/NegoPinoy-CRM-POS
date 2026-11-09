import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Query all order items matching ha121 or cover or cyg
  const { data: targetItems, error } = await supabase
    .from('order_items')
    .select('id, order_id, product_name, quantity, product_id, is_packed, products(id, name, sku)')
    .or('product_name.ilike.%ha121%,product_name.ilike.%cyg%,product_name.ilike.%cover%,product_name.ilike.%takip%');

  if (error) {
    console.error(error);
    return;
  }

  const orderIds = Array.from(new Set(targetItems.map(i => i.order_id)));

  // Fetch orders
  const orders = [];
  for (let i = 0; i < orderIds.length; i += 50) {
    const chunk = orderIds.slice(i, i + 50);
    const { data } = await supabase
      .from('orders')
      .select('id, status, created_at, notes, customer_id, shipping_name, sales_person_name')
      .in('id', chunk);
    if (data) orders.push(...data);
  }

  // Fetch all items for these orders
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

  console.log(`Total orders checked: ${orders.length}`);

  // Let's inspect all orders:
  // Categorize orders:
  // 1. Bundle products: e.g. "Ha121 Wok pan - 34cm with takip (cyg1)"
  //    Wait! If it is a bundle product, does the bundle item itself represent the wok + cover?
  //    What cover does the staff actually pick when fulfilling "Ha121 Wok pan - 34cm with takip (cyg1)"?
  // 2. Standalone HA121 + Standalone Cover in the same order
  // 3. Notes mentioning HA121 and Takip / Cover!

  const analysis = [];

  orders.forEach(o => {
    const oItems = itemsByOrder.get(o.id) || [];
    const haItems = oItems.filter(i => (i.product_name || '').toLowerCase().includes('ha121'));
    const notesLower = (o.notes || '').toLowerCase();
    const hasHaInNotes = notesLower.includes('ha121');

    if (haItems.length === 0 && !hasHaInNotes) return;

    const coverItems = oItems.filter(i => {
      const n = (i.product_name || '').toLowerCase();
      return (n.includes('cover') || n.includes('takip') || n.includes('cyg')) && !haItems.includes(i);
    });

    analysis.push({
      order: o,
      haItems,
      coverItems,
      hasHaInNotes,
    });
  });

  // Sort by created_at desc
  analysis.sort((a, b) => new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime());

  console.log(`\n=== ALL HA121 ORDERS (TOTAL: ${analysis.length}) ===\n`);

  analysis.forEach(({ order: o, haItems, coverItems }) => {
    const isRecent = new Date(o.created_at) >= new Date('2026-09-01T00:00:00Z');
    const isUncompleted = !['Completed', 'Delivered', 'Cancelled', 'Payment Received (COD)'].includes(o.status);

    console.log(`ORDER ${o.id.substring(0, 8)} | ${o.status} | Date: ${o.created_at.substring(0, 10)} | Sales: ${o.sales_person_name || 'N/A'} | Customer: ${o.shipping_name || 'N/A'}`);
    if (o.notes) console.log(`  Notes: ${o.notes.replace(/\n+/g, ' ')}`);
    haItems.forEach(h => {
      console.log(`  [HA121] ${h.quantity}x "${h.product_name}" (SKU: ${h.products?.sku}) Packed:${h.is_packed}`);
    });
    coverItems.forEach(c => {
      console.log(`  [COVER] ${c.quantity}x "${c.product_name}" (SKU: ${c.products?.sku}) Packed:${c.is_packed}`);
    });
    console.log('');
  });
}

run();
