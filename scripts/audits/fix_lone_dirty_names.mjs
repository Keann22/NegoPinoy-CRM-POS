import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PAGE_SIZE = 1000;

/**
 * Finds product rows with stray leading/trailing whitespace in name/variant_name/sku
 * that have NO duplicate sibling (those were already merged in an earlier pass) —
 * these are just individually messy rows that can be fixed with a plain trim, no
 * merging/repointing needed since there's only one row involved.
 */
async function fetchAllProducts() {
  let all = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, variant_name, sku')
      .order('name', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    page++;
  }
  return all;
}

async function main() {
  const all = await fetchAllProducts();
  console.log(`Fetched ${all.length} product rows.\n`);

  // Group by trimmed name+variant to detect if trimming would collide with another row.
  const groups = new Map();
  for (const p of all) {
    const key = (p.name || '').trim().toLowerCase() + '|' + (p.variant_name || '').trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const dirty = all.filter(p =>
    p.name !== p.name.trim() ||
    (p.variant_name && p.variant_name !== p.variant_name.trim()) ||
    (p.sku && p.sku !== p.sku.trim())
  );

  console.log(`Found ${dirty.length} row(s) with stray whitespace.\n`);

  const safe = [];
  const collisions = [];
  for (const p of dirty) {
    const key = (p.name || '').trim().toLowerCase() + '|' + (p.variant_name || '').trim().toLowerCase();
    const group = groups.get(key);
    if (group.length > 1) {
      collisions.push(p);
    } else {
      safe.push(p);
    }
  }

  if (collisions.length > 0) {
    console.log(`WARNING: ${collisions.length} row(s) would collide with another row if trimmed — skipping these, needs manual merge review:`);
    for (const p of collisions) {
      console.log(`  id=${p.id} name=${JSON.stringify(p.name)}`);
    }
    console.log('');
  }

  console.log(`Safely trimming ${safe.length} row(s):\n`);
  for (const p of safe) {
    const update = {};
    if (p.name !== p.name.trim()) update.name = p.name.trim();
    if (p.variant_name && p.variant_name !== p.variant_name.trim()) update.variant_name = p.variant_name.trim();
    if (p.sku && p.sku !== p.sku.trim()) update.sku = p.sku.trim();

    console.log(`  ${p.id}  ${JSON.stringify(p.name)} -> ${JSON.stringify(update.name ?? p.name)}` +
      (update.variant_name ? `  variant ${JSON.stringify(p.variant_name)} -> ${JSON.stringify(update.variant_name)}` : '') +
      (update.sku ? `  sku ${JSON.stringify(p.sku)} -> ${JSON.stringify(update.sku)}` : ''));

    const { error } = await supabase.from('products').update(update).eq('id', p.id);
    if (error) throw new Error(`update ${p.id}: ${error.message}`);
  }

  console.log(`\nDone. Trimmed ${safe.length} row(s), skipped ${collisions.length} collision(s) for manual review.`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
