import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: pos } = await supabase
    .from('purchase_orders')
    .select(`
      id, 
      notes,
      status,
      created_at,
      purchase_order_items (
        id,
        product_id,
        expected_qty,
        created_at
      )
    `)
    .eq('notes', 'STAFF_DRAFT')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('STAFF_DRAFT POs:', JSON.stringify(pos, null, 2));
}

main().catch(console.error);
