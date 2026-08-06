import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Starting stranded expenses migration...');

  // Target rows where category = 'Cost of Goods Sold'
  // Note: ARCHITECTURE.md mentions 171 stranded expense rows.

  // 1. Fetch count first to verify
  const { count: currentCount, error: countErr } = await supabase
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('category', 'Cost of Goods Sold');

  if (countErr) {
    console.error('Error fetching count:', countErr);
    process.exit(1);
  }

  console.log(`Found ${currentCount} stranded "Cost of Goods Sold" expenses.`);

  if (currentCount === 0) {
    console.log('Nothing to do. Migration completed or no records found.');
    process.exit(0);
  }

  // 2. Perform the update
  console.log('Updating category to "Cost of Goods Sold (Legacy/Unreconciled)"...');
  const { data, error: updateErr } = await supabase
    .from('expenses')
    .update({ category: 'Cost of Goods Sold (Legacy/Unreconciled)' })
    .eq('category', 'Cost of Goods Sold')
    .select('id');

  if (updateErr) {
    console.error('Error updating expenses:', updateErr);
    process.exit(1);
  }

  console.log(`Successfully updated ${data?.length} expense rows.`);
  console.log('Migration complete.');
}

run();
