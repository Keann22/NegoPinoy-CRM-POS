import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const STANDALONE_ID = '1732a136-3c38-4ec0-8deb-44ebdba0f345'; // "vichelena 8pcs casserole set"
const V8_ID = '415b1ed0-e451-4a31-a7c6-e31187c270f6'; // VICHELENA COOKWARE SETS - (V8)

const REPOINT_TABLES = [
  { table: 'order_items', col: 'product_id' },
  { table: 'purchase_order_items', col: 'product_id' },
  { table: 'inventory_movements', col: 'product_id' },
  { table: 'order_issues', col: 'product_id' },
  { table: 'returns', col: 'product_id' },
  { table: 'procurement_issues', col: 'product_id' },
];

async function main() {
  const { data: standalone, error: e1 } = await supabase.from('products').select('*').eq('id', STANDALONE_ID).single();
  if (e1) throw e1;
  const { data: v8, error: e2 } = await supabase.from('products').select('*').eq('id', V8_ID).single();
  if (e2) throw e2;

  console.log(`Merging "${standalone.name}" (${STANDALONE_ID}) into "${v8.name}" (${V8_ID})\n`);

  // 1. Repoint all FK references
  for (const { table, col } of REPOINT_TABLES) {
    const { error, count } = await supabase.from(table).update({ [col]: V8_ID }).eq(col, STANDALONE_ID).select('id', { count: 'exact' });
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`  repointed ${table}: ${count ?? 0} rows`);
  }

  // 2. Merge stock level + record audit trail
  const newStock = (v8.stock_level ?? 0) + (standalone.stock_level ?? 0);
  if (newStock !== (v8.stock_level ?? 0)) {
    const { error: stockErr } = await supabase.from('products').update({ stock_level: newStock }).eq('id', V8_ID);
    if (stockErr) throw stockErr;
    const { error: movErr } = await supabase.from('inventory_movements').insert({
      product_id: V8_ID,
      quantity_change: newStock - (v8.stock_level ?? 0),
      movement_type: 'adjustment',
      reason: `Merged duplicate standalone product "${standalone.name}" (${STANDALONE_ID}) into this variant; consolidated stock_level to ${newStock}`,
    });
    if (movErr) throw movErr;
    console.log(`  stock_level: ${v8.stock_level} -> ${newStock}`);
  }

  // 3. Carry over real cost/supplier pricing if V8 was never costed
  const updates = {};
  if ((v8.initial_unit_cost ?? 0) === 0 && (standalone.initial_unit_cost ?? 0) > 0) {
    updates.initial_unit_cost = standalone.initial_unit_cost;
  }
  if ((!v8.supplier_pricing || v8.supplier_pricing.every(sp => !sp.unitCost)) && standalone.supplier_pricing?.length) {
    updates.supplier_pricing = standalone.supplier_pricing;
  }
  // Merge images (dedupe)
  const mergedImages = Array.from(new Set([...(v8.images || []), ...(standalone.images || [])]));
  if (mergedImages.length !== (v8.images || []).length) {
    updates.images = mergedImages;
  }
  if (Object.keys(updates).length > 0) {
    const { error: updErr } = await supabase.from('products').update(updates).eq('id', V8_ID);
    if (updErr) throw updErr;
    console.log(`  updated fields on V8: ${Object.keys(updates).join(', ')}`);
  }

  // 4. Delete the now-empty standalone row
  const { error: delErr } = await supabase.from('products').delete().eq('id', STANDALONE_ID);
  if (delErr) throw new Error(`delete ${STANDALONE_ID}: ${delErr.message}`);
  console.log(`  deleted standalone row ${STANDALONE_ID}`);

  console.log('\nMerge complete. Verifying...');
  const { data: finalV8 } = await supabase.from('products').select('*').eq('id', V8_ID).single();
  console.log(JSON.stringify(finalV8, null, 2));

  for (const { table, col } of REPOINT_TABLES) {
    const { count } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq(col, STANDALONE_ID);
    if (count && count > 0) console.log(`  WARNING: ${table} still has ${count} rows pointing at retired id`);
  }
  const { data: stillExists } = await supabase.from('products').select('id').eq('id', STANDALONE_ID);
  console.log(`  standalone row still exists: ${stillExists && stillExists.length > 0}`);
}

main().catch(err => { console.error('Error during merge:', err); process.exit(1); });
