import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const DRY_RUN = process.argv.includes('--dry-run');

// Every order status where the item still genuinely needs buying (mirrors
// UNFULFILLED_STATUSES in api/inventory/procurement/route.ts). Recreating a
// draft for an order that's already Picked/Packed/etc would just get wiped
// again by the sheet's own auto-cleanup on next load.
const UNFULFILLED_STATUSES = [
  'Pending Payment', 'Processing', 'Picked (with issue)', 'On-Hold', 'Waiting for Stock',
];

async function main() {
  // 1. All still-open, order-level out-of-stock reports (these are the ones
  // that should have created a STAFF_DRAFT line via /api/inventory/procurement-request
  // but silently failed because of the uuid ilike bug).
  const { data: issues, error: iErr } = await supabase
    .from('order_issues')
    .select('id, order_id, product_id, out_of_stock_qty, reported_by_name, created_at, orders(status)')
    .eq('status', 'open')
    .eq('issue_type', 'order')
    .order('created_at', { ascending: true });
  if (iErr) throw iErr;

  console.log(`Found ${issues.length} open order_issues.`);

  // 2. Keep only orders still in an unfulfilled state, and dedupe by
  // (order_id, product_id) keeping the LATEST report (a re-pick of the same
  // order/product supersedes the earlier report of the same shortage).
  const latestByPair = new Map(); // key: order_id|product_id -> issue
  for (const issue of issues) {
    if (!issue.orders || !UNFULFILLED_STATUSES.includes(issue.orders.status)) continue;
    // Old rows from before out_of_stock_qty was tracked have it as null —
    // there's no reliable quantity to backfill, so skip them rather than
    // guessing.
    if (!issue.out_of_stock_qty || issue.out_of_stock_qty <= 0) continue;
    const key = `${issue.order_id}|${issue.product_id}`;
    const existing = latestByPair.get(key);
    if (!existing || new Date(issue.created_at) > new Date(existing.created_at)) {
      latestByPair.set(key, issue);
    }
  }
  console.log(`${latestByPair.size} distinct (order, product) pairs still on unfulfilled orders.`);

  // 3. Only recreate for products that are still actually out of stock.
  const productIds = Array.from(new Set(Array.from(latestByPair.values()).map(i => i.product_id)));
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, name, variant_name, stock_level, assembly_recipe')
    .in('id', productIds);
  if (pErr) throw pErr;
  const productMap = new Map(products.map(p => [p.id, p]));

  const relevantPairs = Array.from(latestByPair.values()).filter(i => {
    const p = productMap.get(i.product_id);
    return p && p.stock_level < 0;
  });
  console.log(`${relevantPairs.length} pairs remain where the product is still negative stock.`);

  if (relevantPairs.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  // Group into per-product totals (mirrors finalRequests in the real route),
  // plus per-order contributions for procurement_request_sources attribution.
  const productTotals = new Map(); // product_id -> qty
  const productLatestReporter = new Map(); // product_id -> reported_by_name
  const productOrderContributions = new Map(); // product_id -> Map(order_id -> qty)

  for (const issue of relevantPairs) {
    productTotals.set(issue.product_id, (productTotals.get(issue.product_id) || 0) + issue.out_of_stock_qty);
    productLatestReporter.set(issue.product_id, issue.reported_by_name);
    if (!productOrderContributions.has(issue.product_id)) productOrderContributions.set(issue.product_id, new Map());
    productOrderContributions.get(issue.product_id).set(issue.order_id, issue.out_of_stock_qty);
  }

  console.log('\n--- Plan ---');
  for (const [productId, qty] of productTotals.entries()) {
    const p = productMap.get(productId);
    console.log(`  ${p.name}${p.variant_name ? ' [' + p.variant_name + ']' : ''} (stock ${p.stock_level}) -> expected_qty ${qty}, reported by ${productLatestReporter.get(productId)}`);
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN: no writes performed.');
    return;
  }

  // 4. Find or create the STAFF_DRAFT PO
  let poId;
  const { data: existingPo } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('notes', 'STAFF_DRAFT')
    .eq('status', 'pending_receipt')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingPo) {
    poId = existingPo.id;
  } else {
    const { data: po, error: poErr } = await supabase
      .from('purchase_orders')
      .insert({ status: 'pending_receipt', notes: 'STAFF_DRAFT' })
      .select('id')
      .single();
    if (poErr) throw poErr;
    poId = po.id;
  }
  console.log('\nUsing STAFF_DRAFT PO:', poId);

  const { data: existingItems } = await supabase
    .from('purchase_order_items')
    .select('id, product_id, expected_qty')
    .eq('po_id', poId);
  const existingMap = new Map((existingItems || []).map(i => [i.product_id, i]));

  const purchaseOrderItemIdByProduct = new Map();
  const itemsToInsert = [];

  for (const [productId, qty] of productTotals.entries()) {
    if (existingMap.has(productId)) {
      const existingItem = existingMap.get(productId);
      const { error } = await supabase
        .from('purchase_order_items')
        .update({
          expected_qty: existingItem.expected_qty + qty,
          status: 'pending_receipt',
          requested_by_name: productLatestReporter.get(productId)
        })
        .eq('id', existingItem.id);
      if (error) throw error;
      purchaseOrderItemIdByProduct.set(productId, existingItem.id);
    } else {
      itemsToInsert.push({
        po_id: poId,
        product_id: productId,
        expected_qty: qty,
        unit_cost: 0,
        status: 'pending_receipt',
        requested_by_name: productLatestReporter.get(productId) || null
      });
    }
  }

  if (itemsToInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from('purchase_order_items')
      .insert(itemsToInsert)
      .select('id, product_id');
    if (error) throw error;
    inserted.forEach(i => purchaseOrderItemIdByProduct.set(i.product_id, i.id));
  }

  const sourceRows = [];
  for (const [productId, contributions] of productOrderContributions.entries()) {
    const itemId = purchaseOrderItemIdByProduct.get(productId);
    if (!itemId) continue;
    for (const [orderId, qty] of contributions.entries()) {
      sourceRows.push({ purchase_order_item_id: itemId, order_id: orderId, quantity: qty });
    }
  }
  if (sourceRows.length > 0) {
    const { error } = await supabase.from('procurement_request_sources').insert(sourceRows);
    if (error) console.error('Error inserting sources:', error.message);
  }

  console.log(`\nDone. Created/updated ${purchaseOrderItemIdByProduct.size} draft line(s), ${sourceRows.length} source attribution row(s).`);
}

main().catch(e => { console.error(e); process.exit(1); });
