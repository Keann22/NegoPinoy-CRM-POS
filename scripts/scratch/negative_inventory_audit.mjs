import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Mirrors procurement-service.ts
const ALL_OPEN_STATUSES = ['Pending Payment','Processing','Picked','Picked (with issue)','Photo','Packed','For Shipping','For Pick-up','On-Hold','Waiting for Stock'];
const UNFULFILLED_STATUSES = ['Processing','Picked (with issue)','Waiting for Stock'];

async function fetchAll(table, select, applyFilters) {
  const pageSize = 1000;
  let from = 0;
  const out = [];
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + pageSize - 1);
    q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function run() {
  // 1. All products with negative stock (exclude deleted)
  const negProducts = await fetchAll('products',
    'id, name, variant_name, stock_level',
    q => q.lt('stock_level', 0).not('name', 'ilike', '[DELETED]%').order('stock_level', { ascending: true }));

  console.log(`Products with negative stock_level: ${negProducts.length}`);
  const totalNegUnits = negProducts.reduce((s, p) => s + p.stock_level, 0);
  console.log(`Total negative units (sum of deficits): ${totalNegUnits}\n`);

  const negIds = negProducts.map(p => p.id);

  // 2. All order_items for these products in OPEN statuses
  const openItems = [];
  for (let i = 0; i < negIds.length; i += 200) {
    const chunk = negIds.slice(i, i + 200);
    const rows = await fetchAll('order_items',
      'product_id, quantity, is_packed, orders!inner(id, status, payment_method)',
      q => q.in('product_id', chunk).in('orders.status', ALL_OPEN_STATUSES));
    openItems.push(...rows);
  }

  // Aggregate demand per product
  const agg = new Map(); // productId -> {openDemand, packedUnits, unfulfilledUnits}
  for (const it of openItems) {
    const o = it.orders;
    if (o.payment_method === 'Lay-away') continue; // excluded from system demand
    const a = agg.get(it.product_id) || { openDemand: 0, packedUnits: 0, unfulfilledUnits: 0 };
    a.openDemand += it.quantity;
    if (it.is_packed) a.packedUnits += it.quantity;
    if (UNFULFILLED_STATUSES.includes(o.status) && !it.is_packed) a.unfulfilledUnits += it.quantity;
    agg.set(it.product_id, a);
  }

  // 3. Classify into buckets
  const rows = negProducts.map(p => {
    const a = agg.get(p.id) || { openDemand: 0, packedUnits: 0, unfulfilledUnits: 0 };
    const deficit = -p.stock_level;
    let bucket;
    if (a.openDemand === 0) {
      // Negative but NO open orders at all -> pure historical phantom.
      // Units were sold on orders that are now completed/cancelled and shipped
      // out, but the receiving was never recorded. Will never self-resolve and
      // shows NO to-buy signal on the procurement page.
      bucket = 'A_phantom_no_open_orders';
    } else if (deficit === a.openDemand) {
      // Ledger deficit exactly equals still-open demand -> app treats as healthy.
      bucket = 'B_reconciled_open';
    } else {
      // Deficit is larger (or smaller) than open demand -> genuine mismatch,
      // part historical phantom + part open orders tangled together.
      bucket = 'C_mixed_mismatch';
    }
    return { name: (p.name + (p.variant_name ? ` [${p.variant_name}]` : '')), deficit, bucket, ...a };
  });

  const buckets = { A_phantom_no_open_orders: [], B_reconciled_open: [], C_mixed_mismatch: [] };
  for (const r of rows) buckets[r.bucket].push(r);

  const sumDef = arr => arr.reduce((s, r) => s + r.deficit, 0);
  console.log('=== BUCKETS ===');
  console.log(`A) Phantom (negative, ZERO open orders) : ${buckets.A_phantom_no_open_orders.length} products, ${sumDef(buckets.A_phantom_no_open_orders)} units`);
  console.log(`   -> pure unrecorded-receipt gaps; no buy signal, will never self-resolve`);
  console.log(`B) Reconciled (deficit == open demand)  : ${buckets.B_reconciled_open.length} products, ${sumDef(buckets.B_reconciled_open)} units`);
  console.log(`   -> app treats as healthy; buy the open qty and it clears`);
  console.log(`C) Mixed mismatch (deficit != demand)   : ${buckets.C_mixed_mismatch.length} products, ${sumDef(buckets.C_mixed_mismatch)} units`);
  console.log(`   -> tangled: some open orders + some unrecorded history`);

  const totalNeedBuy = rows.reduce((s, r) => s + r.unfulfilledUnits, 0);
  console.log(`\nGenuine to-buy units across ALL negative products: ${totalNeedBuy}`);

  console.log('\n=== TOP 25 PHANTOM (bucket A) — sold in the past, never received ===');
  for (const r of buckets.A_phantom_no_open_orders.slice(0, 25)) {
    console.log(`${String(r.deficit).padStart(4)}  ${r.name}`);
  }

  console.log('\n=== TOP 25 MIXED MISMATCH (bucket C) ===');
  for (const r of buckets.C_mixed_mismatch.sort((a,b)=>b.deficit-a.deficit).slice(0, 25)) {
    console.log(`def=${String(r.deficit).padStart(3)} openDemand=${String(r.openDemand).padStart(3)} needBuy=${String(r.unfulfilledUnits).padStart(3)}  ${r.name}`);
  }
}
run().catch(console.error);
