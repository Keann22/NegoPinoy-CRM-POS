require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
    // 1. Fetch orders
    const { data } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'For Shipping')
        .order('order_date', { ascending: true });
        
    const orders = data || [];
    console.log(`Loaded ${orders.length} orders from DB.`);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('eba145638e0c4b20b29df9771d4758f9.xlsx');
    const worksheet = workbook.worksheets[0];
    
    let trackingCol = -1;
    let refCol = -1;
    let pickupTimeCol = 10;
    let paymentRoleCol = 32;
    let codAmountCol = 38;
    let estShippingFeeCol = 42;
    let foundHeaders = false;
    const orderUpdates = {};

    worksheet.eachRow((row) => {
        if (!foundHeaders) {
            row.eachCell((cell, colNumber) => {
                const val = cell.value?.toString().toLowerCase().trim() || '';
                if (val === 'tracking number' || val === 'tracking no.') trackingCol = colNumber;
                else if (val.includes('customer reference') || val === 'order number') refCol = colNumber;
                else if (val.includes('pickup time')) pickupTimeCol = colNumber;
                else if (val.includes('payment role')) paymentRoleCol = colNumber;
                else if (val.includes('cod amount')) codAmountCol = colNumber;
                else if (val.includes('shipping fee') || val.includes('est. shipping')) estShippingFeeCol = colNumber;
            });
            if (trackingCol !== -1 && refCol !== -1) foundHeaders = true;
            return;
        }
        
        const tCol = trackingCol !== -1 ? trackingCol : 1;
        const rCol = refCol !== -1 ? refCol : 3;
        
        const trackingNo = row.getCell(tCol).value?.toString().trim() || '';
        if (!trackingNo || trackingNo.toLowerCase().includes('tracking number')) return;
        
        const rawCustRef = row.getCell(rCol).value?.toString().trim() || ''; 
        let rawPrefix = '';
        const orderIdMatch = rawCustRef.match(/ORDER\s*#?\s*([A-Za-z0-9-]+)/i);
        if (orderIdMatch && orderIdMatch[1]) {
            rawPrefix = orderIdMatch[1].toLowerCase();
        } else if (rawCustRef.match(/^[a-f0-9]{8}(?:-b\d+)?$/i)) {
            rawPrefix = rawCustRef.toLowerCase();
        }
        
        if (rawPrefix) {
            const orderIdPrefix = rawPrefix.replace(/-b\d+$/i, '');
            const matchingOrder = orders.find(o => o.id.toLowerCase().startsWith(orderIdPrefix));
            if (matchingOrder) {
                const fullId = matchingOrder.id;
                if (!orderUpdates[fullId]) orderUpdates[fullId] = { tracking_numbers: [], cod_amount: 0, estimated_shipping_fee: 0 };
                orderUpdates[fullId].tracking_numbers.push(trackingNo);
                orderUpdates[fullId].cod_amount += parseFloat(row.getCell(codAmountCol).value?.toString() || '0') || 0;
                orderUpdates[fullId].estimated_shipping_fee += parseFloat(row.getCell(estShippingFeeCol).value?.toString() || '0') || 0;
                orderUpdates[fullId].scheduled_pickup_time = row.getCell(pickupTimeCol).value?.toString() || '';
                orderUpdates[fullId].payment_role = row.getCell(paymentRoleCol).value?.toString() || '';
            }
        }
    });
    
    console.log(`Found ${Object.keys(orderUpdates).length} order updates`);
    
    for (const [fullId, updateData] of Object.entries(orderUpdates)) {
        const updateObj = {
            status: 'For Pick-up',
            tracking_number: updateData.tracking_numbers.join(', '),
            spx_sync_data: {
                scheduled_pickup_time: updateData.scheduled_pickup_time,
                estimated_shipping_fee: updateData.estimated_shipping_fee,
                cod_amount: updateData.cod_amount,
                payment_role: updateData.payment_role,
                service_type: 'Standard Service',
                collect_type: 'Pickup',
                payment_type: 'Pay by Cycle'
            }
        };
        console.log(`Updating ${fullId}...`);
        const res = await supabase.from('orders').update(updateObj).eq('id', fullId);
        if (res.error) {
            console.error(`Error updating ${fullId}:`, res.error);
        } else {
            console.log(`Success updating ${fullId}`);
        }
    }
}

test().catch(console.error);
