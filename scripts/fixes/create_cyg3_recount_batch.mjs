import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const batchId = crypto.randomUUID();
  const productIds = [
    '3b4ee207-3535-497c-8065-cae95c32f88a', // 30CM
    '74cf28bf-8e4c-4202-98fc-cb76d6273a35', // 32CM
    'dc12b2c6-515d-4ee0-b6e8-18fc1716f15e', // 34CM
    '957f86b4-1ef6-4ca0-9308-95e54b6ef629', // 36CM
    '84aec0d5-289b-41b7-b731-0ab2fe876144', // 38CM
    'b32400d0-f84e-4b55-bae4-3ef4aea480a4', // 40CM
    '878c7bab-6485-44b6-852d-b685d9c36913'  // 42CM
  ];
  const message = 'Pakisigurado na tama ang sukat ng New Covers (Cyg3). Sa HA121 wok, tandaan na ang 34cm wok ay 36cm ang takip, at pareho din sa iba pang sukat ng HA121 wok (laging 1 size mas malaki ang takip). Pakibilang at pakisuri ang bawat sukat sa Unit 1 shelf.';
  const requestedByName = 'Keneth Ornos';
  const dueDate = '2026-11-06';

  const rows = productIds.map(product_id => ({
    batch_id: batchId,
    product_id,
    message,
    requested_by_name: requestedByName,
    due_date: dueDate,
    status: 'open'
  }));

  const { data, error } = await supabase.from('recount_requests').insert(rows).select('id, batch_id, product_id');
  if (error) {
    console.error('Insert error:', error);
    process.exit(1);
  }
  console.log('Successfully created recount batch:', batchId, 'with', data.length, 'items');
}
run();
