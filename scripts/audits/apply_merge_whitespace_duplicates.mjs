import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PAGE_SIZE = 1000;

async function fetchAllProducts() {
  let all = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, variant_name, sku, stock_level, parent_id, assembly_recipe')
      .order('name', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    page++;
  }
  return all;
}

function isCleanName(p) {
  const nameClean = p.name === p.name.trim();
  const variantClean = !p.variant_name || p.variant_name === p.variant_name.trim();
  const noUppercaseUnit = !/\d+CM\b/.test(p.name) && !(p.variant_name && /\d+CM\b/.test(p.variant_name));
  return nameClean && variantClean && noUppercaseUnit;
}

function pickPrimary(group) {
  const clean = group.filter(isCleanName);
  const candidates = clean.length > 0 ? clean : group;
  return [...candidates].sort((a, b) => (b.stock_level || 0) - (a.stock_level || 0))[0];
}

const REPOINT_TABLES = [
  { table: 'order_items', col: 'product_id' },
  { table: 'purchase_order_items', col: 'product_id' },
  { table: 'inventory_movements', col: 'product_id' },
  { table: 'order_issues', col: 'product_id' },
  { table: 'returns', col: 'product_id' },
  { table: 'procurement_issues', col: 'product_id' },
];

async function main() {
  const all = await fetchAllProducts();
  console.log(`Fetched ${all.length} product rows.\n`);

  const groups = new Map();
  for (const p of all) {
    const key = (p.name || '').trim().toLowerCase() + '|' + (p.variant_name || '').trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const dupGroups = Array.from(groups.values()).filter(g => g.length > 1 && new Set(g.map(p => p.name)).size > 1);

  const plans = dupGroups.map(group => {
    const primary = pickPrimary(group);
    const retire = group.filter(p => p.id !== primary.id);
    const newStock = group.reduce((sum, p) => sum + (p.stock_level || 0), 0);
    return { primary, retire, newStock };
  });

  console.log(`Merging ${plans.length} groups...\n`);

  for (const plan of plans) {
    const displayName = plan.primary.variant_name ? `${plan.primary.name} [${plan.primary.variant_name}]` : plan.primary.name;
    console.log(`--- ${displayName} ---`);

    // 1. Consolidate stock onto the primary, logging an adjustment if it actually changes.
    if (plan.newStock !== (plan.primary.stock_level ?? 0)) {
      const { error: stockErr } = await supabase
        .from('products')
        .update({ stock_level: plan.newStock })
        .eq('id', plan.primary.id);
      if (stockErr) throw stockErr;

      await supabase.from('inventory_movements').insert({
        product_id: plan.primary.id,
        quantity_change: plan.newStock - (plan.primary.stock_level ?? 0),
        movement_type: 'adjustment',
        reason: `Merged duplicate product row(s) [${plan.retire.map(r => r.id).join(', ')}] into this product; consolidated stock to ${plan.newStock}`,
      });
      console.log(`  stock ${plan.primary.stock_level ?? 0} -> ${plan.newStock}`);
    } else {
      console.log(`  stock unchanged (${plan.newStock})`);
    }

    for (const retire of plan.retire) {
      // 2. Repoint every table that references the retiring product_id.
      for (const { table, col } of REPOINT_TABLES) {
        const { error } = await supabase.from(table).update({ [col]: plan.primary.id }).eq(col, retire.id);
        if (error) throw new Error(`${table}: ${error.message}`);
      }

      // 3. Repoint any child variant rows pointing at the retiring row as their parent.
      const { error: parentErr } = await supabase
        .from('products')
        .update({ parent_id: plan.primary.id })
        .eq('parent_id', retire.id);
      if (parentErr) throw new Error(`products.parent_id: ${parentErr.message}`);

      // 4. Delete the retiring row.
      const { error: delErr } = await supabase.from('products').delete().eq('id', retire.id);
      if (delErr) throw new Error(`delete ${retire.id}: ${delErr.message}`);
      console.log(`  retired ${retire.id}`);
    }
    console.log('');
  }

  console.log('Merge complete. Verifying no whitespace/casing duplicates remain...\n');
  const after = await fetchAllProducts();
  const afterGroups = new Map();
  for (const p of after) {
    const key = (p.name || '').trim().toLowerCase() + '|' + (p.variant_name || '').trim().toLowerCase();
    if (!afterGroups.has(key)) afterGroups.set(key, []);
    afterGroups.get(key).push(p);
  }
  const remaining = Array.from(afterGroups.values()).filter(g => g.length > 1 && new Set(g.map(p => p.name)).size > 1);
  console.log(remaining.length === 0 ? 'Confirmed: 0 whitespace/casing duplicate groups remain.' : `WARNING: ${remaining.length} groups still remain.`);
  console.log(`Total products now: ${after.length} (was ${all.length})`);
}

main().catch(err => {
  console.error('Error during merge:', err);
  process.exit(1);
});
