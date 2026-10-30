/*
 * Stored shelf stock vs the locked formula (step 3 of the stored shelf stock plan).
 * Read-only. Lists every product where products.shelf_stock differs from
 * max(0, stock_level + unpicked), plus any sync errors.
 *
 *   node_modules/.bin/tsx --tsconfig tsconfig.json scripts/reports/compare_shelf_stock.ts
 *
 * A difference means a missed or wrong event (or a count that disagrees with
 * stock_level). Look at shelf_stock_movements and inventory_movements for the product.
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPages } from '../../src/lib/services/procurement-demand-service';
import { getUnpickedQtyMap, unallocatedFromStockLevel } from '../../src/lib/services/inventory/shelf-stock-service';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const pht = (t: string) => new Date(new Date(t).getTime() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

(async () => {
  const [products, unpicked, errors, live] = await Promise.all([
    fetchAllPages<any>((from, to) =>
      supabase.from('products').select('id, name, stock_level, shelf_stock, assembly_recipe').not('shelf_stock', 'is', null).order('id').range(from, to)
    ),
    getUnpickedQtyMap(supabase),
    supabase.from('shelf_stock_errors').select('created_at, order_id, context, message').order('created_at', { ascending: false }).limit(20),
    supabase.from('shelf_stock_settings').select('value').eq('key', 'live').maybeSingle(),
  ]);

  const diffs = products
    .filter((p) => !(Array.isArray(p.assembly_recipe) && p.assembly_recipe.length > 0))
    .map((p) => ({ name: p.name as string, shelf: p.shelf_stock as number, formula: unallocatedFromStockLevel(p.stock_level, unpicked.get(p.id) || 0) }))
    .filter((d) => d.shelf !== d.formula);

  console.log(`live: ${live.data?.value ?? '?'} | products tracked: ${products.length} | different: ${diffs.length}`);
  diffs.sort((a, b) => Math.abs(b.shelf - b.formula) - Math.abs(a.shelf - a.formula)).slice(0, 40)
    .forEach((d) => console.log(`  ${d.name.slice(0, 50).padEnd(50)} shelf ${String(d.shelf).padStart(5)}  formula ${String(d.formula).padStart(5)}`));
  const errs = errors.data || [];
  console.log(`sync errors: ${errs.length}`);
  errs.forEach((e: any) => console.log(`  ${pht(e.created_at)} ${e.context} ${e.order_id || ''}: ${e.message}`));
})();
