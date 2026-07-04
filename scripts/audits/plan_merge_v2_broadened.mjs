import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PAGE_SIZE = 1000;

/**
 * Broadened re-scan: the original merge (plan_merge_whitespace_duplicates.mjs) only
 * flagged a group as a duplicate if the raw `name` differed between rows. It missed
 * groups where `name` is byte-identical but `variant_name` differs only by whitespace
 * (e.g. "30cm " vs "30cm") — confirmed real via "Stainless Strainers with Handle Ha109
 * - 30cm", where both rows share the same parent_id. This version flags ANY group of
 * 2+ rows with the same trimmed name+variant, regardless of which field carried the
 * whitespace difference.
 */
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

async function main() {
  const all = await fetchAllProducts();
  console.log(`Fetched ${all.length} product rows.\n`);

  const groups = new Map();
  for (const p of all) {
    const key = (p.name || '').trim().toLowerCase() + '|' + (p.variant_name || '').trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const dupGroups = Array.from(groups.values()).filter(g => g.length > 1);

  console.log(`Found ${dupGroups.length} duplicate group(s) (broadened detection):\n`);

  for (const group of dupGroups) {
    const primary = pickPrimary(group);
    const retire = group.filter(p => p.id !== primary.id);
    const newStock = group.reduce((sum, p) => sum + (p.stock_level || 0), 0);
    const displayName = primary.variant_name ? `${primary.name} [${primary.variant_name}]` : primary.name;
    console.log(`KEEP:   ${primary.id}  "${displayName}"  (stock ${primary.stock_level ?? 0}) -> new stock ${newStock}`);
    for (const r of retire) {
      console.log(`RETIRE: ${r.id}  "${r.variant_name ? `${r.name} [${r.variant_name}]` : r.name}"  (stock ${r.stock_level ?? 0})  raw_name=${JSON.stringify(r.name)} raw_variant=${JSON.stringify(r.variant_name)}`);
    }
    console.log('');
  }

  console.log('This was a DRY RUN — nothing was changed.');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
