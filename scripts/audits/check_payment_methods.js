const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envConfig = dotenv.parse(envContent);
for (const k in envConfig) {
    process.env[k] = envConfig[k];
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPaymentMethods() {
    const { error } = await supabase
        .from('payments')
        .select('payment_method, count:id');
        
    if (error) {
        console.error(error);
        return;
    }
    
    // Actually we need to group by in js since count aggregate is not as simple
    const { data: allPayments } = await supabase.from('payments').select('payment_method');
    const counts = {};
    for (const p of allPayments) {
        counts[p.payment_method] = (counts[p.payment_method] || 0) + 1;
    }
    
    console.log('Payment Methods:', counts);
}

checkPaymentMethods();
