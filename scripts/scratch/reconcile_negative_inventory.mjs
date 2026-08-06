import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const APPLY = process.argv.includes('--apply');

// Mirrors src/lib/services/procurement-service.ts
const ALL_OPEN_STATUSES = ['Pending Payment','Processing','Picked','Picked (with issue)','Photo','Packed','For Shipping','For Pick-up','On-Hold','Waiting for Stock'];
const UNFULFILLED_STATUSES = ['Processing','Picked (with issue)','Waiting for Stock'];

async function fetchAllChunked(ids, buildQuery) {
  const out = [];
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    let from = 0;
    while (true) {
      const { data, error } = await buildQuery(chunk, from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }
  }
  return out;
}

async function run() {
  // 1. All negative-stock products (candidates)
  const negProducts = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('products')
      .select('id, name, variant_name, stock_level')
      .lt('stock_level', 0).range(from, from + 999);
    if (error) throw error;
    negProducts.push(...data);
    if (data.length < 1000) break;
  }
  const candidateIds = new Set(negProducts.map(p => p.id));

  // 2. Bundle recipes that consume a candidate component
  const bundleProducts = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('products').select('id, assembly_recipe').range(from, from + 999);
    if (error) throw error;
    bundleProducts.push(...data);
    if (data.length < 1000) break;
  }
  const bundleToComponents = new Map();
  for (const bp of bundleProducts) {
    const recipe = Array.isArray(bp.assembly_recipe) ? bp.assembly_recipe : [];
    if (recipe.length === 0) continue;
    const relevant = recipe
      .map(c => ({ componentId: c.productId || c.component_id, qtyPerBundle: c.quantity || 1 }))
      .filter(c => c.componentId && candidateIds.has(c.componentId));
    if (relevant.length > 0) bundleToComponents.set(bp.id, relevant);
  }
  const allDemandIds = Array.from(new Set([...candidateIds, ...bundleToComponents.keys()]));

  // 3. Live open demand
  const demandRows = await fetchAllChunked(allDemandIds, (chunk, a, b) =>
    supabase.from('order_items')
      .select('product_id, quantity, is_packed, orders!inner(id, status, payment_method)')
      .in('product_id', chunk).in('orders.status', ALL_OPEN_STATUSES).range(a, b));

  // 4. Open issues (for Picked-with-issue accuracy)
  const openIssues = await fetchAllChunked(allDemandIds, (chunk, a, b) =>
    supabase.from('order_issues').select('order_id, product_id').eq('status', 'open').in('product_id', chunk).range(a, b));
  const openIssueKeys = new Set(openIssues.map(i => `${i.order_id}-${i.product_id}`));

  // 5. Compute raw unfulfilled (genuinely-owed, NOT reduced by pending POs —
  //    stock only rises when goods are received, so pending POs stay owed)
  const owed = new Map(); // productId -> units genuinely still to buy
  const add = (pid, qty, unfulfilled) => { if (unfulfilled) owed.set(pid, (owed.get(pid) || 0) + qty); };
  for (const row of demandRows) {
    if (row.orders.payment_method === 'Lay-away') continue; // held/future — excluded from system demand
    let unfulfilled = false;
    if (row.is_packed) unfulfilled = false;
    else if (row.orders.status === 'Picked (with issue)') unfulfilled = openIssueKeys.has(`${row.orders.id}-${row.product_id}`);
    else unfulfilled = UNFULFILLED_STATUSES.includes(row.orders.status);

    if (candidateIds.has(row.product_id)) add(row.product_id, row.quantity, unfulfilled);
    bundleToComponents.get(row.product_id)?.forEach(c => add(c.componentId, row.quantity * c.qtyPerBundle, unfulfilled));
  }

  // 6. Targets — only ever move UP toward 0 (never more negative, never positive)
  const changes = [];
  let resetToZero = 0, trimmed = 0, clampedLeftAlone = 0;
  for (const p of negProducts) {
    const genuinelyOwed = owed.get(p.id) || 0;
    const target = Math.max(p.stock_level, -genuinelyOwed); // <= 0 always
    if (target === p.stock_level) { clampedLeftAlone++; continue; }
    if (target === 0) resetToZero++; else trimmed++;
    changes.push({
      id: p.id,
      name: p.name + (p.variant_name ? ` [${p.variant_name}]` : ''),
      from: p.stock_level, to: target, delta: target - p.stock_level, owed: genuinelyOwed,
    });
  }

  const unitsCleared = changes.reduce((s, c) => s + c.delta, 0);
  console.log(`MODE: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`);
  console.log(`Negative products scanned : ${negProducts.length}`);
  console.log(`Will change               : ${changes.length}`);
  console.log(`  -> reset fully to 0      : ${resetToZero}`);
  console.log(`  -> trimmed (still owe some): ${trimmed}`);
  console.log(`Left unchanged (owe >= current deficit, clamped): ${clampedLeftAlone}`);
  console.log(`Ghost units cleared (stock moved up by): ${unitsCleared}`);
  const beforeNeg = negProducts.reduce((s,p)=>s + p.stock_level, 0);
  const afterNeg = negProducts.reduce((s,p)=>s + Math.max(p.stock_level, -(owed.get(p.id)||0)), 0);
  console.log(`Total negative BEFORE: ${beforeNeg}`);
  console.log(`Total negative AFTER (genuine backlog only): ${afterNeg}\n`);

  console.log('Sample of largest ghost clears:');
  for (const c of [...changes].sort((a,b)=>b.delta-a.delta).slice(0,20)) {
    console.log(`  ${c.from} -> ${c.to}  (owed ${c.owed})  ${c.name}`);
  }

  if (!APPLY) { console.log('\nDry run only. Re-run with --apply to write.'); return; }

  console.log('\nApplying...');
  const reason = 'Ledger reconciliation: cleared unrecorded-receipt ghost deficit, kept genuine open-order backlog (order-state derived, no physical count)';
  let done = 0, failed = 0;
  for (const c of changes) {
    const { error: uErr } = await supabase.from('products').update({ stock_level: c.to }).eq('id', c.id);
    if (uErr) { console.error(`FAIL update ${c.name}:`, uErr.message); failed++; continue; }
    const { error: lErr } = await supabase.from('inventory_movements').insert({
      product_id: c.id, quantity_change: c.delta, movement_type: 'adjustment',
      reason: `${reason} (${c.from} -> ${c.to})`, supplier_name: 'System Reconciliation',
    });
    if (lErr) console.error(`WARN log ${c.name}:`, lErr.message);
    done++;
  }
  console.log(`Applied ${done} updates, ${failed} failed.`);
}
run().catch(e => { console.error(e); process.exit(1); });
