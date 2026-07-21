import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProcurement() {
  const { data: drafts, error } = await supabase
    .from('purchase_order_items')
    .select('id, product_id, expected_qty, purchase_orders!inner(notes), products!inner(name, variant_name)')
    .eq('purchase_orders.notes', 'STAFF_DRAFT')
    .eq('status', 'pending_receipt')
    .ilike('products.name', '%cyp3 mixing bowl%');
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log("DRAFTS:", JSON.stringify(drafts, null, 2));
  }
}

checkProcurement();
