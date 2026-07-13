import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // 1. Any STAFF_DRAFT purchase_orders at all (even empty ones)?
  const { data: draftPOs } = await supabase
    .from('purchase_orders')
    .select('id, notes, status, created_at')
    .eq('notes', 'STAFF_DRAFT')
    .order('created_at', { ascending: false });
  console.log('=== STAFF_DRAFT purchase_orders (any) ===');
  console.log('Count:', draftPOs?.length || 0);
  (draftPOs || []).forEach(p => console.log(' ', p.id, p.status, p.created_at));

  // 2. procurement_request_sources - any rows left at all?
  const { data: sources, error: srcErr } = await supabase
    .from('procurement_request_sources')
    .select('id, purchase_order_item_id, order_id, quantity, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  console.log('\n=== procurement_request_sources (most recent 20) ===');
  if (srcErr) console.log('error:', srcErr.message);
  console.log('Returned:', sources?.length || 0);
  (sources || []).forEach(s => console.log(' ', JSON.stringify(s)));

  // 3. Recent order_issues (picker-reported out-of-stock) - last 5 days
  const since = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const { data: issues } = await supabase
    .from('order_issues')
    .select('id, order_id, product_id, status, out_of_stock_qty, created_at, resolved_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  console.log('\n=== order_issues in last 5 days ===');
  console.log('Count:', issues?.length || 0);
  (issues || []).forEach(i => console.log(' ', JSON.stringify(i)));

  // 4. Orders whose status changed to a "fulfilled" bucket recently (last 5 days) via order_logs
  const { data: logs } = await supabase
    .from('order_logs')
    .select('order_id, action, details, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);
  console.log('\n=== order_logs last 5 days (most recent 50) ===');
  console.log('Count:', logs?.length || 0);
  (logs || []).slice(0, 50).forEach(l => console.log(' ', l.created_at, l.order_id, l.action, JSON.stringify(l.details)?.slice(0,150)));

  // 5. Any notifications referencing procurement/staff draft
  const { data: notifs } = await supabase
    .from('notifications')
    .select('id, type, message, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30);
  console.log('\n=== notifications last 5 days ===');
  console.log('Count:', notifs?.length || 0);
  (notifs || []).forEach(n => console.log(' ', n.created_at, n.type, n.message?.slice(0,100)));
}

check().catch(console.error);
