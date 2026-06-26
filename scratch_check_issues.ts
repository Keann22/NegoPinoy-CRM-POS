import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('--- RECENT ORDER ISSUES (FROM PICKERS) ---');
  const { data: issues } = await supabase
    .from('order_issues')
    .select(`
      id,
      product_id,
      order_id,
      created_at,
      status,
      products (name, variant_name)
    `)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(JSON.stringify(issues, null, 2));

  console.log('\n--- RECENT PURCHASE ORDERS ---');
  const { data: pos } = await supabase
    .from('purchase_orders')
    .select(`
      id, notes, status, created_at
    `)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(JSON.stringify(pos, null, 2));

  console.log('\n--- RECENT PO ITEMS ADDED ---');
  const { data: items } = await supabase
    .from('purchase_order_items')
    .select(`
      id,
      po_id,
      product_id,
      expected_qty,
      created_at,
      products (name, variant_name)
    `)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(JSON.stringify(items, null, 2));
}

main().catch(console.error);
