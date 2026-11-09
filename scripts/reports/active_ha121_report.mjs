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

  // Filter to active/open orders: Processing, Picked, Picked (with issue), For Pick-up, Photo
  const activeOrders = orders.filter(o => 
    ['Processing', 'Picked', 'Picked (with issue)', 'For Pick-up', 'Photo', 'For Packing', 'Packed'].includes(o.status)
  );

  activeOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  console.log(`=== ACTIVE / OPEN ORDERS REQUIRING HA121 / COVERS AUDIT: ${activeOrders.length} ===\n`);

  const report = [];

  for (const o of activeOrders) {
    const oItems = itemsByOrder.get(o.id) || [];
    const haItems = oItems.filter(i => (i.product_name || '').toLowerCase().includes('ha121'));
    const notesLower = (o.notes || '').toLowerCase();
    const hasHaInNotes = notesLower.includes('ha121');
    const covers = oItems.filter(i => {
      const n = (i.product_name || '').toLowerCase();
      return (n.includes('new covers') || n.includes('cyg1 lid cover') || n.includes('cover full glass') || n.includes('takip only')) && !haItems.includes(i);
    });

    if (haItems.length === 0 && !hasHaInNotes && covers.length === 0) continue;

    report.push({
      id: o.id,
      shortId: `#${o.id.substring(0, 7).toUpperCase()}`,
      status: o.status,
      date: o.created_at.substring(0, 10),
      sales: o.sales_person_name || 'N/A',
      customer: o.shipping_name || 'N/A',
      notes: o.notes,
      haItems,
      covers
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

run();
