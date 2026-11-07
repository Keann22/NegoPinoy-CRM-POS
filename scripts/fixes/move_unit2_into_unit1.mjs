// One-time cleanup (2026-11-07, owner: "move all to Unit 1").
// Receiving put every delivery into Unit 2 by default, while the goods went on
// the Unit 1 shelf and orders took stock off Unit 1. So Unit 2 showed 4,139
// pieces on 552 products and Unit 1 went negative. The team works from one
// warehouse; Unit 2 is only for a few SKUs (none right now).
// Moves every positive Unit 2 number into Unit 1 as one stock transfer
// (execute_stock_transfer: totals don't change). Saves a before-snapshot.
//
//   node scripts/fixes/move_unit2_into_unit1.mjs          (dry run)
//   node scripts/fixes/move_unit2_into_unit1.mjs --apply
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: whs, error: whErr } = await sb.from('warehouses').select('id, code');
if (whErr) throw whErr;
const u1 = whs.find((w) => w.code === 'UNIT1')?.id;
const u2 = whs.find((w) => w.code === 'UNIT2')?.id;
if (!u1 || !u2) throw new Error('Unit 1 / Unit 2 not found');

async function snapshot() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('product_warehouse_stock')
      .select('product_id, warehouse_id, stock_level, products(name, stock_level)')
      .in('warehouse_id', [u1, u2]).order('product_id').order('warehouse_id').range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const byProduct = new Map();
  for (const r of rows) {
    const p = byProduct.get(r.product_id) || { productId: r.product_id, name: r.products?.name, total: r.products?.stock_level, unit1: 0, unit2: 0 };
    if (r.warehouse_id === u1) p.unit1 = r.stock_level; else p.unit2 = r.stock_level;
    byProduct.set(r.product_id, p);
  }
  return Array.from(byProduct.values());
}

const before = await snapshot();
const items = before.filter((p) => p.unit2 > 0).map((p) => ({ productId: p.productId, quantity: p.unit2 }));
console.log(`Products with Unit 2 stock: ${items.length}, pieces: ${items.reduce((s, i) => s + i.quantity, 0)}`);
const totalsBefore = new Map(before.map((p) => [p.productId, p.total]));

if (!APPLY) {
  console.log('Dry run. Add --apply to move them.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(`scripts/reports/unit2_merge_before_${stamp}.json`, JSON.stringify(before, null, 1));

const { data: transferId, error } = await sb.rpc('execute_stock_transfer', {
  p_from_warehouse_id: u2,
  p_to_warehouse_id: u1,
  p_items: items,
  p_notes: 'One-time cleanup 2026-11-07: Receiving had put every delivery into Unit 2 (goods were on the Unit 1 shelf). Owner: move all to Unit 1.',
  p_created_by: 'System (Unit 2 cleanup)',
});
if (error) throw error;
console.log('Transfer', transferId);

const after = await snapshot();
fs.writeFileSync(`scripts/reports/unit2_merge_after_${stamp}.json`, JSON.stringify(after, null, 1));
const changedTotals = after.filter((p) => totalsBefore.get(p.productId) !== p.total);
const leftInUnit2 = after.filter((p) => p.unit2 > 0);
console.log(`Totals changed: ${changedTotals.length} (should be 0). Still in Unit 2: ${leftInUnit2.length}.`);
if (changedTotals.length) console.log(changedTotals.slice(0, 10));
