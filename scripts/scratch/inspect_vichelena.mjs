import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: standalone, error: e1 } = await supabase
    .from('products')
    .select('*')
    .ilike('name', '%vichelena 8pcs casserole%');
  if (e1) throw e1;
  console.log('=== STANDALONE CANDIDATES ===');
  console.log(JSON.stringify(standalone, null, 2));

  const { data: parentCandidates, error: e2 } = await supabase
    .from('products')
    .select('*')
    .ilike('name', '%VICHELENA COOKWARE%');
  if (e2) throw e2;
  console.log('\n=== PARENT/VARIANT CANDIDATES (name match) ===');
  console.log(JSON.stringify(parentCandidates, null, 2));

  const parents = (parentCandidates || []).filter(p => !p.parent_id);
  for (const parent of parents) {
    const { data: children } = await supabase
      .from('products')
      .select('*')
      .eq('parent_id', parent.id);
    console.log(`\n=== CHILDREN OF PARENT ${parent.id} (${parent.name}) ===`);
    console.log(JSON.stringify(children, null, 2));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
