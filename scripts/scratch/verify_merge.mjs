import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const STANDALONE_ID = '1732a136-3c38-4ec0-8deb-44ebdba0f345';
const V8_ID = '415b1ed0-e451-4a31-a7c6-e31187c270f6';

const TABLES = ['order_items', 'purchase_order_items', 'inventory_movements', 'order_issues', 'returns', 'procurement_issues'];

async function main() {
  for (const table of TABLES) {
    const { count: onStandalone } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('product_id', STANDALONE_ID);
    const { count: onV8 } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('product_id', V8_ID);
    console.log(`${table}: still on retired id = ${onStandalone}, now on V8 = ${onV8}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
