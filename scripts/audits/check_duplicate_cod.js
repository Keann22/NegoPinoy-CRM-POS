const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables from .env.local
const envContent = fs.readFileSync('.env.local', 'utf-8');
const envConfig = dotenv.parse(envContent);
for (const k in envConfig) {
    process.env[k] = envConfig[k];
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
    console.log('Fetching all payments...');
    
    const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('id, order_id, amount, payment_date, notes, payment_method')
        .order('payment_date', { ascending: true });

    if (paymentsError) {
        console.error('Error fetching payments:', paymentsError);
        return;
    }

    const paymentsByOrder = {};
    for (const p of payments) {
        if (!paymentsByOrder[p.order_id]) {
            paymentsByOrder[p.order_id] = [];
        }
        paymentsByOrder[p.order_id].push(p);
    }

    const ordersWithDuplicates = [];

    for (const [orderId, orderPayments] of Object.entries(paymentsByOrder)) {
        if (orderPayments.length > 1) {
            ordersWithDuplicates.push({
                orderId,
                payments: orderPayments
            });
        }
    }

    console.log(`Found ${ordersWithDuplicates.length} orders with multiple payments.`);

    if (ordersWithDuplicates.length > 0) {
        for (let i = 0; i < Math.min(10, ordersWithDuplicates.length); i++) {
            console.log(`Order ID: ${ordersWithDuplicates[i].orderId}`);
            ordersWithDuplicates[i].payments.forEach(p => {
                console.log(`  - ${p.payment_method}: ${p.amount} (${p.payment_date})`);
            });
        }
    }
}

checkDuplicates();
