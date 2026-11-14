/**
 * 2026-11-14: staff counted the 4A reserve; 3C is empty for these items (owner).
 * Saves each as 4A = count, 3C = 0: sets the 4A row (logged adjustment), then a
 * shelf count of the same number (applyPhysicalShelfCount: shelf_stock = count,
 * stock_level = count − unpicked). Dry run unless --apply.
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { applyPhysicalShelfCount } from '../../src/lib/services/inventory/inventory-guardian-action-service';
import { getUnpickedQtyForProduct } from '../../src/lib/services/inventory/shelf-stock-service';

const SET = process.argv.filter((a) => a.startsWith('--set=')).map((a) => a.slice(6).split('=')).map(([id, n]) => [id, Number(n)] as [string, number]);
const ALL: [string, number][] = [
  ['2113ae1f-4b3e-4695-a776-3c486584067a', 8],  // Steamer/Casserole 28cm
  ['1ff00146-457e-4a39-9519-10ce1bd63367', 5],  // 30cm
  ['2725d874-a3f1-4a0f-b527-df0d1f1a5ef4', 7],  // 32cm
  ['af6de63c-1c76-4bfb-8326-cf44cc8bc90c', 6],  // 34cm
  ['35060b9c-5f01-4ac8-aa11-1a478735ecb0', 10], // 36cm
  ['c4b5bf04-35f2-489e-b805-bc5c1ec7a1c2', 11], // Pressure cooker 3 valve 8L
  ['b289e5ed-e243-4663-b341-1951b89b700b', 13], // 6L
  ['f510dce6-86c9-4c6f-afee-c9a7838bdc02', 3],  // 10L
  ['5f2ddba9-e44c-4cc2-a8ee-5ec7469f8615', 4],  // 12L
  ['83426a3c-6a22-4f6b-a267-e98b2ec3ed57', 23], // Rice barrel 25kg
  ['006444b5-b9d1-437b-a483-c883242fe7b2', 4],  // 43kg SLIM
  ['63775c7f-8520-432a-9df4-ac929102b74f', 2],  // 8kg
  ['4f50ca2b-835b-4ba3-85a9-ec4d33b9cf96', 2],  // 15kg
  // Added later: Stainless Charcoal Stove 1 (cab4e798-63bf-4857-b35f-abe11905bc65), run with --set=<id>=1
];
// --set=<productId>=<count> saves only those (backup gets its own file).
const COUNTS = SET.length ? SET : ALL;
const ACTOR = 'Owner (4A count 2026-11-14)';
const NOTE = '4A counted by staff, 3C empty (owner, 2026-11-14): 4A';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const apply = process.argv.includes('--apply');

(async () => {
  const { data: wh } = await sb.from('warehouses').select('id, code');
  const u1 = wh!.find((w) => w.code === 'UNIT1')!.id;
  const u2 = wh!.find((w) => w.code === 'UNIT2')!.id;
  const backup: any[] = [];
  for (const [id, count] of COUNTS) {
    const { data: p } = await sb.from('products').select('id, name, stock_level, shelf_stock').eq('id', id).single();
    const { data: rows } = await sb.from('product_warehouse_stock').select('warehouse_id, stock_level').eq('product_id', id);
    const r1 = rows?.find((r) => r.warehouse_id === u1)?.stock_level ?? 0;
    const r2 = rows?.find((r) => r.warehouse_id === u2)?.stock_level ?? 0;
    const unpicked = (await getUnpickedQtyForProduct(sb as any, id)).qty;
    backup.push({ id, name: p!.name, shelf_stock: p!.shelf_stock, stock_level: p!.stock_level, unit1_row: r1, unit2_row: r2 });
    console.log(`${p!.name}: shelf ${p!.shelf_stock} -> ${count} | 4A row ${r2} -> ${count} | stock_level ${p!.stock_level} -> ${count - unpicked} (unpicked ${unpicked}) | 3C row ${r1} -> ${-unpicked}`);
    if (!apply) continue;
    const { error: e1 } = await sb.from('product_warehouse_stock').upsert({ product_id: id, warehouse_id: u2, stock_level: count }, { onConflict: 'product_id,warehouse_id' });
    if (e1) throw e1;
    await sb.from('inventory_movements').insert({
      product_id: id, quantity_change: count - r2, movement_type: 'adjustment', warehouse_id: u2,
      timestamp: new Date().toISOString(), reason: `${NOTE} set to ${count} (was ${r2}). ${ACTOR}`, performed_by_name: ACTOR,
    });
    await applyPhysicalShelfCount(sb as any, { productId: id, physicalShelfCount: count, notes: `${NOTE} ${count}, 3C 0. ${ACTOR}`, actorName: ACTOR });
  }
  if (apply) fs.writeFileSync(SET.length ? `scripts/reports/4a_count_2026_11_14_before_${SET.map(([id]) => id.slice(0, 8)).join('_')}.json` : 'scripts/reports/4a_count_2026_11_14_before.json', JSON.stringify(backup, null, 2));
  console.log(apply ? 'APPLIED (backup in scripts/reports)' : 'dry run');
})();
