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
  console.log(`=== References to standalone product ${STANDALONE_ID} ===`);
  for (const { table, col } of REPOINT_TABLES) {
    const { data, count, error } = await supabase.from(table).select('*', { count: 'exact' }).eq(col, STANDALONE_ID);
    if (error) { console.log(`  ${table}: ERROR ${error.message}`); continue; }
    console.log(`  ${table}: ${count}`);
    if (data && data.length > 0 && data.length <= 20) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  // Children of standalone (should be none - it's a leaf)
  const { data: children } = await supabase.from('products').select('id, name, parent_id').eq('parent_id', STANDALONE_ID);
  console.log(`\n  products.parent_id -> standalone: ${children?.length || 0}`, children);

  // Bundle assembly_recipe references
  const { data: allProducts } = await supabase.from('products').select('id, name, assembly_recipe').not('assembly_recipe', 'is', null);
  const bundleRefs = (allProducts || []).filter(p => Array.isArray(p.assembly_recipe) && p.assembly_recipe.length > 0 && p.assembly_recipe.some(c => c.productId === STANDALONE_ID));
  console.log(`\n  assembly_recipe references to standalone: ${bundleRefs.length}`, bundleRefs.map(b => ({ id: b.id, name: b.name })));

  // procurement_request_sources (indirect via purchase_order_items)
  const { data: poItems } = await supabase.from('purchase_order_items').select('id').eq('product_id', STANDALONE_ID);
  if (poItems && poItems.length > 0) {
    const poItemIds = poItems.map(p => p.id);
    const { data: sources, count: srcCount } = await supabase.from('procurement_request_sources').select('*', { count: 'exact' }).in('purchase_order_item_id', poItemIds);
    console.log(`\n  procurement_request_sources (via purchase_order_items): ${srcCount}`, sources);
  } else {
    console.log('\n  procurement_request_sources: 0 (no purchase_order_items rows to check against)');
  }

  console.log('\n=== V8 target product current state ===');
  const { data: v8 } = await supabase.from('products').select('*').eq('id', V8_ID).single();
  console.log(JSON.stringify(v8, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
