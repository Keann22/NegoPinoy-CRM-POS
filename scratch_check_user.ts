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
    .select('*')
    .eq('notes', 'STAFF_DRAFT')
    .order('created_at', { ascending: false })
    .limit(1);

  console.log('PO:', JSON.stringify(pos, null, 2));

  if (pos && pos.length > 0) {
    const { data: items } = await supabase
      .from('purchase_order_items')
      .select('*')
      .eq('po_id', pos[0].id)
      .limit(1);
    console.log('PO Items:', JSON.stringify(items, null, 2));
  }
}

main().catch(console.error);
