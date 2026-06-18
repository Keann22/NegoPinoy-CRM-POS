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

async function checkTotals() {
    console.log('Fetching orders and payments...');
    
    const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, amount_paid, balance_due, status');
        
    const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('order_id, amount');

    if (ordersError || paymentsError) {
        console.error('Error fetching:', ordersError, paymentsError);
        return;
    }

    const paymentsByOrder = {};
    for (const p of payments) {
        if (!paymentsByOrder[p.order_id]) paymentsByOrder[p.order_id] = 0;
        paymentsByOrder[p.order_id] += p.amount;
    }

    const mismatchedOrders = [];

    for (const o of orders) {
        const actualPayments = paymentsByOrder[o.id] || 0;
        // Float comparison safe check
        if (Math.abs((o.amount_paid || 0) - actualPayments) > 0.01) {
            mismatchedOrders.push({
                orderId: o.id,
                orderAmountPaid: o.amount_paid,
                sumOfPayments: actualPayments,
                status: o.status
            });
        }
    }

    console.log(`Found ${mismatchedOrders.length} orders with mismatched amount_paid vs sum of payments.`);
    
    if (mismatchedOrders.length > 0) {
        console.log('Mismatched Orders:');
        mismatchedOrders.slice(0, 10).forEach(m => {
            console.log(`- Order: ${m.orderId.substring(0,8)}... | amount_paid on order: ${m.orderAmountPaid} | sum of payments: ${m.sumOfPayments} | status: ${m.status}`);
        });
    }
}

checkTotals();
