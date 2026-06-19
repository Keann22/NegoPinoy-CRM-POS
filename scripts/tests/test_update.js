require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function test() {
    const res = await supabase.from('orders').update({status: 'For Pick-up', tracking_number: 'SPEPH069574033066', spx_sync_data: {cod_amount: 0}}).eq('id', 'cb634396-04e2-4f6f-8db8-a6534d22fe9d');
    console.log(res);
}
test();
