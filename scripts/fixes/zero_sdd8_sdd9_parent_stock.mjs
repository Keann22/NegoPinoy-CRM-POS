// 2026-11-07: receipts "SDD-8" / "SDD-9" were matched to the main products, so
// 23 table runners and 48 table mats were received onto "Sdd8 table runner" and
// "Sdd9 Table mat" while orders use the variants (TM1-3, D9-1..3). Orders never
// use the main product, so that stock is invisible to pickers. Take it off the
// main products; Jas recounts the variants (recount request) to put it where
// it really is. Receiving was fixed in 63a42e4.
import dotenv from 'dotenv';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

const { data: sdd9, error: sErr } = await supabase.from('products').select('id').eq('name', 'Sdd9 Table mat').is('parent_id', null).single();
if (sErr) throw sErr;
const PARENTS = [
  '025747c9-8561-4bc4-b340-f7992b5c9e69', // Sdd8 table runner
  sdd9.id, // Sdd9 Table mat
];

const snapshot = async () => {
  const { data } = await supabase.from('products')
    .select('id, name, stock_level, product_warehouse_stock(warehouse_id, stock_level)')
    .or(PARENTS.map((id) => `id.eq.${id},parent_id.eq.${id}`).join(','));
  return data;
};

const before = await snapshot();
console.table(before.map((p) => ({ name: p.name, stock: p.stock_level })));
if (!APPLY) { console.log('Dry run. Pass --apply to write.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(`scripts/reports/sdd_parent_stock_before_${stamp}.json`, JSON.stringify(before, null, 2));

const actor = 'Keneth Ornos';
for (const id of PARENTS) {
  const { data: p } = await supabase.from('products').select('name, stock_level').eq('id', id).single();
  const qty = Number(p.stock_level) || 0;
  if (qty === 0) continue;
  const { data: rows } = await supabase.from('product_warehouse_stock')
    .select('warehouse_id, stock_level').eq('product_id', id).neq('stock_level', 0);
  for (const w of rows || []) {
    const { error } = await supabase.rpc('increment_warehouse_stock', {
      p_product_id: id, p_warehouse_id: w.warehouse_id, p_qty: -Number(w.stock_level), p_new_unit_cost: null,
    });
    if (error) throw error;
  }
  const { data: after } = await supabase.from('products').select('stock_level').eq('id', id).single();
  if (Number(after.stock_level) !== 0) {
    const { error } = await supabase.rpc('increment_stock', { p_product_id: id, qty: -Number(after.stock_level), new_unit_cost: null });
    if (error) throw error;
  }
  const { error: mvErr } = await supabase.from('inventory_movements').insert({
    product_id: id,
    quantity_change: -qty,
    movement_type: 'adjustment',
    reason: `Received onto the main product by mistake (receipt had no variant). Stock is on the variants; Jas recounts them. -${qty}`,
    performed_by_name: actor,
  });
  if (mvErr) throw mvErr;
  console.log(`${p.name}: ${qty} -> 0`);
}

const finalState = await snapshot();
fs.writeFileSync(`scripts/reports/sdd_parent_stock_after_${stamp}.json`, JSON.stringify(finalState, null, 2));
console.table(finalState.map((p) => ({ name: p.name, stock: p.stock_level })));
