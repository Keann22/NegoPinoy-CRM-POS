import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Query all products with ha121 or with assembly_recipe
  const { data: prods, error } = await supabase
    .from('products')
    .select('id, name, sku, stock_level, assembly_recipe')
    .ilike('name', '%ha121%')
    .order('name');

  if (error) {
    console.error(error);
    return;
  }

  // Collect all component IDs
  const componentIds = new Set();
  prods.forEach(p => {
    if (Array.isArray(p.assembly_recipe)) {
      p.assembly_recipe.forEach(c => {
        const cId = c.productId || c.component_id;
        if (cId) componentIds.add(cId);
      });
    }
  });

  // Fetch component product info
  const { data: compProds } = await supabase
    .from('products')
    .select('id, name, sku, stock_level')
    .in('id', Array.from(componentIds));

  const compMap = new Map();
  (compProds || []).forEach(cp => compMap.set(cp.id, cp));

  console.log(`=== HA121 PRODUCTS & THEIR ASSEMBLY RECIPES (COMPONENTS) ===\n`);

  prods.forEach(p => {
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`Product: "${p.name}" (ID: ${p.id}, SKU: ${p.sku})`);
    if (!p.assembly_recipe || !Array.isArray(p.assembly_recipe) || p.assembly_recipe.length === 0) {
      console.log(`  No assembly recipe set.`);
    } else {
      console.log(`  Assembly Recipe (${p.assembly_recipe.length} components):`);
      p.assembly_recipe.forEach((c, idx) => {
        const cId = c.productId || c.component_id;
        const cp = compMap.get(cId);
        const qty = c.quantity || c.qty || 1;
        console.log(`    [Component ${idx + 1}] Qty: ${qty}x`);
        console.log(`      ID: ${cId}`);
        console.log(`      Name: "${cp ? cp.name : 'UNKNOWN PRODUCT'}"`);
        console.log(`      SKU: ${cp ? cp.sku : 'N/A'}`);
        console.log(`      Raw Recipe Entry:`, JSON.stringify(c));
      });
    }
  });
}

run();
