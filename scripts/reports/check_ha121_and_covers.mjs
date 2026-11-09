import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Query all order items matching ha121 or cyg3 or cover
  const { data: items, error } = await supabase
    .from('order_items')
    .select('id, order_id, product_name, quantity, product_id, is_packed, products(id, name, sku)')
    .or('product_name.ilike.%ha121%,product_name.ilike.%cyg3%,product_name.ilike.%cover%');

  if (error) {
    console.error(error);
    return;
  }

  const orderIds = Array.from(new Set(items.map(i => i.order_id)));

  // Fetch orders in chunks
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

  console.log(`Analyzing ${orders.length} orders...\n`);

  // We want to inspect:
  // 1. All orders with HA121
  // 2. All orders with New Covers (Cyg3)
  // Let's filter orders from October 2026 onwards first, or any active/pending orders.
  const octNovOrders = orders.filter(o => new Date(o.created_at) >= new Date('2026-10-01T00:00:00Z'));
  octNovOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  console.log(`=== RECENT ORDERS (OCT-NOV 2026) WITH HA121 OR CYG3 COVERS: ${octNovOrders.length} ===\n`);

  octNovOrders.forEach(o => {
    const oItems = itemsByOrder.get(o.id) || [];
    const haItems = oItems.filter(i => (i.product_name || '').toLowerCase().includes('ha121'));
    const cygItems = oItems.filter(i => (i.product_name || '').toLowerCase().includes('cyg'));
    const coverItems = oItems.filter(i => (i.product_name || '').toLowerCase().includes('cover') || (i.product_name || '').toLowerCase().includes('takip'));

    if (haItems.length === 0 && cygItems.length === 0) return;

    console.log(`--------------------------------------------------------------------------------`);
    console.log(`Order: ${o.id.substring(0, 8)} | Full ID: ${o.id} | Status: ${o.status} | Date: ${o.created_at}`);
    console.log(`Sales Person: ${o.sales_person_name || 'N/A'} | Customer: ${o.shipping_name || 'N/A'}`);
    if (o.notes) console.log(`Notes: ${o.notes.trim()}`);
    console.log(`HA121 Items:`);
    if (haItems.length === 0) console.log(`  (None)`);
    else {
      haItems.forEach(i => console.log(`  - ${i.quantity}x "${i.product_name}" (SKU: ${i.products?.sku}) [Packed: ${i.is_packed}]`));
    }
    console.log(`Cover / Cyg Items in same order:`);
    if (cygItems.length === 0 && coverItems.length === 0) console.log(`  (None)`);
    else {
      const relevantCovers = Array.from(new Set([...cygItems, ...coverItems]));
      relevantCovers.forEach(i => {
        if (!haItems.includes(i)) {
          console.log(`  - ${i.quantity}x "${i.product_name}" (SKU: ${i.products?.sku}) [Packed: ${i.is_packed}]`);
        }
      });
    }
  });

}

run();
