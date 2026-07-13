require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
    // 1. Fetch orders
    const { data } = await supabase
        .from('orders')
        .select('id, spx_sync_data')
        .in('id', ['cb634396-04e2-4f6f-8db8-a6534d22fe9d', '3fe2dd2a-6674-4db1-a65d-f801719d2047'])
        
    const orders = data || [];

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
                if (trackingCol === -1 && (val === 'tracking number' || val === 'tracking no.')) trackingCol = colNumber;
                else if (refCol === -1 && (val.includes('customer reference') || val === 'order number')) refCol = colNumber;
                else if (pickupTimeCol === 10 && val.includes('pickup time')) pickupTimeCol = colNumber;
                else if (paymentRoleCol === 32 && val.includes('payment role')) paymentRoleCol = colNumber;
                else if (codAmountCol === 38 && val.includes('cod amount')) codAmountCol = colNumber;
                else if (estShippingFeeCol === 42 && (val === 'estimated shipping fee' || val === 'est. shipping fee' || val.includes('est. shipping'))) estShippingFeeCol = colNumber;
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
                if (!orderUpdates[fullId]) orderUpdates[fullId] = { tracking_numbers: [], cod_amount: 0, estimated_shipping_fee: 0, spx_sync_data: matchingOrder.spx_sync_data };
                orderUpdates[fullId].tracking_numbers.push(trackingNo);
                orderUpdates[fullId].cod_amount += parseFloat(row.getCell(codAmountCol).value?.toString() || '0') || 0;
                orderUpdates[fullId].estimated_shipping_fee += parseFloat(row.getCell(estShippingFeeCol).value?.toString() || '0') || 0;
            }
        }
    });
    
    console.log(`Found ${Object.keys(orderUpdates).length} order updates`);
    
    for (const [fullId, updateData] of Object.entries(orderUpdates)) {
        const updateObj = {
            spx_sync_data: {
                ...updateData.spx_sync_data,
                estimated_shipping_fee: updateData.estimated_shipping_fee,
            }
        };
        console.log(`Updating ${fullId} with fee ${updateData.estimated_shipping_fee}...`);
        await supabase.from('orders').update(updateObj).eq('id', fullId);
    }
}

test().catch(console.error);
