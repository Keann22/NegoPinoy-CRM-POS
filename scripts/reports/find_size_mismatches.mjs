import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: allItems, error } = await supabase
    .from('order_items')
    .select('id, order_id, product_name, quantity, product_id, is_packed, products(id, name, sku)')
    .or('product_name.ilike.%ha121%,product_name.ilike.%cyg%,product_name.ilike.%cover%,product_name.ilike.%takip%');

  if (error) {
    console.error(error);
    return;
  }

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

  console.log(`Checking ${orders.length} orders for size mismatches or standalone covers...`);

  // Let's inspect every order that has an HA121 item or cover item
  const findings = [];

  for (const o of orders) {
    const oItems = itemsByOrder.get(o.id) || [];
    const notes = o.notes || '';

    // Check if order has HA121
    const haItems = oItems.filter(i => (i.product_name || '').toLowerCase().includes('ha121'));
    // Check standalone covers
    const covers = oItems.filter(i => {
      const n = (i.product_name || '').toLowerCase();
      return (n.includes('new covers') || n.includes('cyg1 lid cover') || n.includes('cover full glass') || n.includes('takip only')) && !haItems.includes(i);
    });

    if (haItems.length > 0 || covers.length > 0 || notes.toLowerCase().includes('ha121')) {
      findings.push({
        order: o,
        haItems,
        covers,
        notes
      });
    }
  }

  // Sort descending
  findings.sort((a, b) => new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime());

  // Focus on orders that are either:
  // 1. Not completed/delivered/cancelled
  // 2. Or from October 1, 2026 to present
  const recentOrActive = findings.filter(f => 
    new Date(f.order.created_at) >= new Date('2026-10-01T00:00:00Z') ||
    !['Completed', 'Delivered', 'Cancelled', 'Payment Received (COD)'].includes(f.order.status)
  );

  console.log(`\nFound ${recentOrActive.length} recent or active orders with HA121 or Covers:\n`);

  recentOrActive.forEach(f => {
    const o = f.order;
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`ORDER #${o.id.substring(0, 7).toUpperCase()} | Status: ${o.status} | Created: ${o.created_at} | Sales: ${o.sales_person_name || 'N/A'} | Customer: ${o.shipping_name || 'N/A'}`);
    if (f.notes) console.log(`  Notes: ${f.notes.trim()}`);
    f.haItems.forEach(h => {
      console.log(`  [HA121] ${h.quantity}x "${h.product_name}" | SKU: ${h.products?.sku} | Packed: ${h.is_packed}`);
    });
    f.covers.forEach(c => {
      console.log(`  [COVER] ${c.quantity}x "${c.product_name}" | SKU: ${c.products?.sku} | Packed: ${c.is_packed}`);
    });
  });
}

run();
