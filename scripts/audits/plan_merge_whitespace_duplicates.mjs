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

/** A row with no leading/trailing whitespace and lowercase unit suffix (e.g. "cm" not "CM") wins as primary. */
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

  const plans = [];
  for (const group of dupGroups) {
    const primary = pickPrimary(group);
    const retire = group.filter(p => p.id !== primary.id);
    const newStock = group.reduce((sum, p) => sum + (p.stock_level || 0), 0);
    plans.push({ primary, retire, newStock, displayName: primary.variant_name ? `${primary.name} [${primary.variant_name}]` : primary.name });
  }

  const retireIds = plans.flatMap(p => p.retire.map(r => r.id));

  console.log(`Planned merges: ${plans.length} groups, retiring ${retireIds.length} rows.\n`);

  // Check cross-references for every ID being retired, across every table that stores a product_id.
  const tablesToCheck = [
    { table: 'order_items', col: 'product_id' },
    { table: 'purchase_order_items', col: 'product_id' },
    { table: 'inventory_movements', col: 'product_id' },
    { table: 'order_issues', col: 'product_id' },
    { table: 'returns', col: 'product_id' },
    { table: 'procurement_issues', col: 'product_id' },
  ];

  const referenceCounts = {};
  for (const { table, col } of tablesToCheck) {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .in(col, retireIds);
    if (error) {
      console.log(`  (skipping ${table}: ${error.message})`);
      continue;
    }
    referenceCounts[table] = count || 0;
  }

  // Check if any retired row is itself a parent (has children pointing to it via parent_id).
  const { data: childRows } = await supabase
    .from('products')
    .select('id, name, parent_id')
    .in('parent_id', retireIds);

  // Check if any retired row is referenced inside another product's assembly_recipe JSON.
  const assemblyReferences = [];
  for (const p of all) {
    if (!p.assembly_recipe || !Array.isArray(p.assembly_recipe)) continue;
    for (const comp of p.assembly_recipe) {
      if (retireIds.includes(comp.productId)) {
        assemblyReferences.push({ bundleId: p.id, bundleName: p.name, componentId: comp.productId });
      }
    }
  }

  console.log('=== MERGE PLAN ===\n');
  for (const plan of plans) {
    console.log(`KEEP:   ${plan.primary.id}  "${plan.displayName}"  (current stock ${plan.primary.stock_level ?? 0}) -> new stock ${plan.newStock}`);
    for (const r of plan.retire) {
      console.log(`RETIRE: ${r.id}  "${r.variant_name ? `${r.name} [${r.variant_name}]` : r.name}"  (stock ${r.stock_level ?? 0})`);
    }
    console.log('');
  }

  console.log('=== CROSS-REFERENCE IMPACT ===');
  for (const [table, count] of Object.entries(referenceCounts)) {
    console.log(`  ${table}: ${count} row(s) reference a retiring product_id — will be repointed to the surviving id`);
  }
  console.log(`  products.parent_id: ${childRows?.length || 0} row(s) have a retiring row as their parent — will be repointed`);
  console.log(`  assembly_recipe (JSON): ${assemblyReferences.length} reference(s) found`);
  if (assemblyReferences.length > 0) {
    for (const ref of assemblyReferences) {
      console.log(`    bundle "${ref.bundleName}" (${ref.bundleId}) references retiring component ${ref.componentId}`);
    }
  }
  if (childRows && childRows.length > 0) {
    for (const c of childRows) {
      console.log(`    child "${c.name}" (${c.id}) has parent_id=${c.parent_id}`);
    }
  }

  console.log('\nThis was a DRY RUN — nothing was changed.');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
