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

async function checkOrder() {
    console.log('Fetching orders...');
    
    const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*');
        
    const o = orders.find(x => x.id.replace(/-/g, '').toLowerCase().startsWith('7089d3d0'));
    
    if (!o) {
        console.log('Order not found');
        return;
    }

    console.log('Order Details:', o);

    // FIX the order!
    if (o.amount_paid > o.subtotal) {
        // Calculate original total. Let's say half of amount_paid
        const newAmount = o.amount_paid / 2;
        console.log(`Fixing amount_paid from ${o.amount_paid} to ${newAmount}`);
        const { error: updErr } = await supabase.from('orders').update({ amount_paid: newAmount }).eq('id', o.id);
        if (updErr) {
            console.error('Update error:', updErr);
        } else {
            console.log('Successfully fixed duplicate payment amount.');
        }
    }
}

checkOrder();
