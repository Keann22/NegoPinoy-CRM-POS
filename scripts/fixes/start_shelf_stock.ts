/*
 * Sets the starting shelf_stock for every product (step 1 of the stored shelf
 * stock plan, architecture.md). Starting value = today's locked unallocated
 * formula, max(0, stock_level + unpicked). Products where the formula is below
 * zero start at 0 and are listed for a shelf count (their data is off).
 * Bundles hold no stock and are skipped.
 *
 * Dry run:  node_modules/.bin/tsx --tsconfig tsconfig.json scripts/fixes/start_shelf_stock.ts
 * Apply:    ... scripts/fixes/start_shelf_stock.ts --apply
 *
 * Re-run with --apply when step 2 goes live so the start matches that moment.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPages } from '../../src/lib/services/procurement-demand-service';
import { getUnpickedQtyMap } from '../../src/lib/services/inventory/shelf-stock-service';

const APPLY = process.argv.includes('--apply');
const ACTOR = 'Start of stored shelf stock';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const [products, unpicked] = await Promise.all([
    fetchAllPages<any>((from, to) =>
      supabase.from('products').select('id, name, sku, stock_level, assembly_recipe').order('id').range(from, to)
    ),
    getUnpickedQtyMap(supabase),
  ]);

  const rows: { product_id: string; value: number; reason: string }[] = [];
  const below: { name: string; sku: string; stock_level: number; unpicked: number; formula: number }[] = [];
  for (const p of products) {
    if (Array.isArray(p.assembly_recipe) && p.assembly_recipe.length > 0) continue; // bundle
    const u = unpicked.get(p.id) || 0;
    const formula = (p.stock_level ?? 0) + u;
    if (formula < 0) {
      below.push({ name: p.name, sku: p.sku || '', stock_level: p.stock_level ?? 0, unpicked: u, formula });
      rows.push({ product_id: p.id, value: 0, reason: `Started at 0: stock ${p.stock_level} + ${u} unpicked = ${formula}. Count this shelf.` });
    } else {
      rows.push({ product_id: p.id, value: formula, reason: `Started from unallocated: stock ${p.stock_level ?? 0} + ${u} unpicked.` });
    }
  }

  console.log(`products ${products.length}, to start ${rows.length}, below zero ${below.length}`);
  console.log('total pieces on shelves:', rows.reduce((s, r) => s + r.value, 0));

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csv = ['name,sku,stock_level,unpicked,formula']
    .concat(below.map((b) => [JSON.stringify(b.name), JSON.stringify(b.sku), b.stock_level, b.unpicked, b.formula].join(',')))
    .join('\n');
  const out = path.join('scripts', 'reports', `shelf_stock_start_below_zero_${stamp}.csv`);
  fs.writeFileSync(out, csv);
  console.log('below-zero list:', out);

  if (!APPLY) return;
  let done = 0;
  for (let i = 0; i < rows.length; i += 300) {
    const { data, error } = await supabase.rpc('start_shelf_stock', { p_rows: rows.slice(i, i + 300), p_actor: ACTOR });
    if (error) throw error;
    done += Number(data) || 0;
  }
  console.log('started', done, 'products at', new Date().toISOString());
})();
