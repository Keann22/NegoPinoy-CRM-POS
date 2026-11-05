import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('recount_requests')
    .delete()
    .eq('batch_id', '8f75ccfc-a6bd-41bc-b9a1-49ca2a6eae55')
    .select('id');

  if (error) {
    console.error('Delete error:', error);
    process.exit(1);
  }
  console.log(`Successfully removed ${data.length} recount request items for batch 8f75ccfc-a6bd-41bc-b9a1-49ca2a6eae55`);
}

run();
