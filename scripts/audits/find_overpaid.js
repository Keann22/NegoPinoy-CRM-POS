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

async function findOverpaid() {
    console.log('Fetching orders...');
    
    const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*');
        
    if (ordersError || orders.length === 0) {
        console.error('Error fetching orders:', ordersError);
        return;
    }

    const overpaid = [];
    const duplicates = [];
    
    for (const o of orders) {
        // Look closely at the total calculation. The total on the UI is often subtotal - total_discount + insurance_fee. 
        // Sometimes shipping_fee is added? Let's check if shipping_fee exists.
        const expectedTotal = (o.subtotal || 0) - (o.total_discount || 0) + (o.insurance_fee || 0) + (o.shipping_fee || 0);
        const diff = (o.amount_paid || 0) - expectedTotal;
        
        if (diff > 0.01) {
            overpaid.push({
                id: o.id,
                expectedTotal,
                amountPaid: o.amount_paid,
                status: o.status,
                diff,
                ratio: o.amount_paid / expectedTotal
            });
            
            if (Math.abs(o.amount_paid - (expectedTotal * 2)) < 0.01) {
                duplicates.push(o);
            }
        }
    }

    console.log(`Found ${overpaid.length} overpaid orders.`);
    console.log(`Found ${duplicates.length} exactly DUPLICATED orders (amount_paid == 2 * expected).`);
    
    if (duplicates.length > 0) {
        console.log('Duplicated Orders:');
        duplicates.slice(0, 10).forEach(o => {
            console.log(`- Order ${o.id.substring(0,8)} | Expected: ${(o.subtotal || 0) - (o.total_discount || 0) + (o.insurance_fee || 0) + (o.shipping_fee || 0)} | Paid: ${o.amount_paid}`);
        });
    }
}

findOverpaid();
