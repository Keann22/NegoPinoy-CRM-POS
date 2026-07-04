import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PAGE_SIZE = 1000;

/**
 * Finds product rows whose names are identical once trimmed/lowercased but differ
 * in the raw string (usually stray leading/trailing whitespace or a stray tab).
 * These render identically in the UI (HTML collapses whitespace) but are separate
 * database rows with separate stock levels — a real data quality issue, not a bug
 * in any one feature. Pages through the table explicitly rather than one unfiltered
 * select, per ARCHITECTURE.md's "1000-row query cap" rule.
 */
async function findWhitespaceDuplicates() {
  let all = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, variant_name, sku, stock_level, parent_id')
      .order('name', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`Fetched ${all.length} product rows.`);

  const groups = new Map();
  for (const p of all) {
    const key = (p.name || '').trim().toLowerCase() + '|' + (p.variant_name || '').trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const dupGroups = Array.from(groups.values()).filter(g => g.length > 1);
  // Only report groups where the RAW name actually differs between members
  // (a real whitespace/casing issue) — not groups that are truly identical duplicates.
  const whitespaceDupGroups = dupGroups.filter(g => new Set(g.map(p => p.name)).size > 1);

  console.log(`\nFound ${whitespaceDupGroups.length} groups of products that look identical but differ only in whitespace/casing:\n`);

  for (const group of whitespaceDupGroups) {
    console.log('---');
    for (const p of group) {
      const visibleName = JSON.stringify(p.name);
      console.log(`  id=${p.id}  name=${visibleName}  variant=${p.variant_name || '-'}  sku=${p.sku || '-'}  stock=${p.stock_level ?? 0}`);
    }
  }

  console.log(`\nTotal affected rows: ${whitespaceDupGroups.reduce((sum, g) => sum + g.length, 0)}`);
}

findWhitespaceDuplicates().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
