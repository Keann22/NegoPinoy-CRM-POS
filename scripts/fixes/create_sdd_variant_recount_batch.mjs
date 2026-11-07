// 2026-11-07: after taking the Sdd8/Sdd9 stock off the main products
// (zero_sdd8_sdd9_parent_stock.mjs), Jas counts the variants that weren't
// counted today. TM2 and D9-3 were counted this afternoon, after the deliveries.
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const names = [
  'Sdd8 table runner - TM1',
  'Sdd8 table runner - TM3',
  'Sdd9 Table mat - D9-1 (4PCS)',
  'Sdd9 Table mat -  D9-2 (4PCS)',
];
const { data: products, error: pErr } = await supabase.from('products').select('id, name').in('name', names);
if (pErr) throw pErr;
if (products.length !== names.length) throw new Error(`Expected ${names.length} products, found ${products.length}`);

const batchId = crypto.randomUUID();
const message = 'Yung table runner (SDD-8) at table mat (SDD-9) na dumating nitong Nov 5-6, napunta sa main product imbes na sa TM1/TM2/TM3 at D9-1/D9-2/D9-3. Naayos na ang system. Pakibilang lahat ng piraso ng bawat variant na ito, kasama ang galing sa delivery (kahit nasa Unit 2 o nasa kahon pa).';
const rows = products.map((p) => ({
  batch_id: batchId,
  product_id: p.id,
  message,
  requested_by_name: 'Keneth Ornos',
  due_date: '2026-11-07',
  status: 'open',
}));
const { data, error } = await supabase.from('recount_requests').insert(rows).select('id, product_id');
if (error) throw error;
console.log('Created recount batch', batchId, 'with', data.length, 'products:', products.map((p) => p.name).join(', '));
