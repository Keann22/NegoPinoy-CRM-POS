import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const since = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  console.log('since:', since);

  console.log('\n--- order_issues last 5 days (select *) ---');
  const { data: issues, error: iErr } = await supabase
    .from('order_issues')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  if (iErr) console.log('ERROR:', iErr.message);
  console.log('Count:', issues?.length || 0);
  (issues || []).forEach(i => console.log(' ', JSON.stringify(i)));

  console.log('\n--- notifications last 5 days (select *) ---');
  const { data: notifs, error: nErr } = await supabase
    .from('notifications')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(40);
  if (nErr) console.log('ERROR:', nErr.message);
  console.log('Count:', notifs?.length || 0);
  (notifs || []).forEach(n => console.log(' ', JSON.stringify(n)));

  console.log('\n--- procurement_request_sources (select *, no filter) ---');
  const { data: srcs, error: sErr } = await supabase
    .from('procurement_request_sources')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  if (sErr) console.log('ERROR:', sErr.message);
  console.log('Count:', srcs?.length || 0);
  (srcs || []).forEach(s => console.log(' ', JSON.stringify(s)));

  console.log('\n--- procurement_issues (select *, no filter) ---');
  const { data: pissues, error: pErr } = await supabase
    .from('procurement_issues')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  if (pErr) console.log('ERROR:', pErr.message);
  console.log('Count:', pissues?.length || 0);
  (pissues || []).forEach(p => console.log(' ', JSON.stringify(p)));
}

check().catch(console.error);
