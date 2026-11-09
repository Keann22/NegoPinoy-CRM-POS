import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, assembly_recipe')
    .not('assembly_recipe', 'is', null);

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Total products with assembly recipe: ${data.length}\n`);
  data.forEach(p => {
    if (Array.isArray(p.assembly_recipe) && p.assembly_recipe.length > 0) {
      const isWokOrCover = (p.name || '').toLowerCase().includes('wok') || (p.name || '').toLowerCase().includes('cover') || (p.name || '').toLowerCase().includes('takip');
      if (isWokOrCover) {
        console.log(`Bundle: "${p.name}" (SKU: ${p.sku})`);
        p.assembly_recipe.forEach(c => {
          console.log(`  - ${c.quantity || 1}x "${c.productName || c.productId}"`);
        });
        console.log('');
      }
    }
  });
}
run();
