require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
    // 1. Fetch orders exactly like the UI does
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
    let foundHeaders = false;
    const orderUpdates = {};

    worksheet.eachRow((row) => {
        if (!foundHeaders) {
            row.eachCell((cell, colNumber) => {
                const val = cell.value?.toString().toLowerCase().trim() || '';
                if (val === 'tracking number' || val === 'tracking no.') trackingCol = colNumber;
                else if (val.includes('customer reference') || val === 'order number') refCol = colNumber;
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
                console.log(`Matched! Prefix ${orderIdPrefix} matches ${matchingOrder.id}`);
                const fullId = matchingOrder.id;
                if (!orderUpdates[fullId]) orderUpdates[fullId] = { tracking_numbers: [] };
                orderUpdates[fullId].tracking_numbers.push(trackingNo);
            } else {
                console.log(`Failed to match! Prefix ${orderIdPrefix} not found in DB orders`);
            }
        }
    });
    
    console.log(`Found ${Object.keys(orderUpdates).length} order updates`);
}

test().catch(console.error);
