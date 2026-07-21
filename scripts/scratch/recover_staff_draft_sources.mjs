import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log('Fetching STAFF_DRAFT PO...');
  const { data: draftPo, error: draftPoErr } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('notes', 'STAFF_DRAFT')
    .single();

  if (draftPoErr || !draftPo) {
    console.log('No STAFF_DRAFT found.');
    return;
  }

  console.log('Fetching pending items in STAFF_DRAFT...');
  const { data: draftItems, error: itemsErr } = await supabase
    .from('purchase_order_items')
    .select('id, product_id, expected_qty, received_qty')
    .eq('po_id', draftPo.id)
    .eq('status', 'pending_receipt');

  if (itemsErr) throw itemsErr;
  if (!draftItems || draftItems.length === 0) {
    console.log('No pending items in STAFF_DRAFT.');
    return;
  }

  const draftItemIds = draftItems.map(i => i.id);

  console.log('Checking existing sources...');
  const { data: existingSources, error: sourcesErr } = await supabase
    .from('procurement_request_sources')
    .select('purchase_order_item_id')
    .in('purchase_order_item_id', draftItemIds);

  if (sourcesErr) throw sourcesErr;

  const itemsWithSources = new Set(existingSources?.map(s => s.purchase_order_item_id));
  const itemsWithoutSources = draftItems.filter(i => !itemsWithSources.has(i.id));

  console.log(`Found ${draftItems.length} total draft items. ${itemsWithoutSources.length} have NO linked orders.`);

  if (itemsWithoutSources.length === 0) return;

  const productIds = itemsWithoutSources.map(i => i.product_id);

  console.log('Fetching open orders for these products...');
  // ALL_OPEN_STATUSES is roughly ['Pending', 'Processing', 'Picked (with issue)', 'Ready for Release'] etc.
  // We'll just exclude completed, shipped, cancelled, deleted
  const closedStatuses = ['completed', 'shipped', 'cancelled', 'deleted'];
  
  const { data: orderItems, error: oiErr } = await supabase
    .from('order_items')
    .select('product_id, quantity, is_packed, orders!inner(id, status)')
    .in('product_id', productIds)
    .not('orders.status', 'in', `(${closedStatuses.join(',')})`);

  if (oiErr) throw oiErr;

  if (!orderItems || orderItems.length === 0) {
    console.log('No open orders found needing these products.');
    return;
  }

  const sourcesToInsert = [];

  for (const item of itemsWithoutSources) {
    const ordersForProduct = orderItems.filter(oi => oi.product_id === item.product_id);
    
    // Group by order id in case there are duplicates (unlikely for same product in same order, but just in case)
    const orderQtyMap = new Map();
    for (const oi of ordersForProduct) {
      // If it's packed, it doesn't need to be bought, but we'll link it anyway since it was an open order demand.
      // Usually needToBuy ignores is_packed, but we'll just link the order.
      orderQtyMap.set(oi.orders.id, (orderQtyMap.get(oi.orders.id) || 0) + oi.quantity);
    }

    let remainingToLink = item.expected_qty - (item.received_qty || 0);

    for (const [orderId, qty] of orderQtyMap.entries()) {
      if (remainingToLink <= 0) break;
      
      const linkQty = Math.min(qty, remainingToLink);
      sourcesToInsert.push({
        purchase_order_item_id: item.id,
        order_id: orderId,
        quantity: linkQty
      });
      remainingToLink -= linkQty;
    }
  }

  if (sourcesToInsert.length > 0) {
    console.log(`Inserting ${sourcesToInsert.length} recovered order links...`);
    const { error: insErr } = await supabase
      .from('procurement_request_sources')
      .insert(sourcesToInsert);
    if (insErr) throw insErr;
    console.log('Done!');
  } else {
    console.log('No links to insert (perhaps no matching orders).');
  }
}

run().catch(console.error);
