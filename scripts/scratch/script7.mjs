import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

const supabaseUrl = 'https://sgkjdtwqqbrpmrfukhja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNna2pkdHdxcWJycG1yZnVraGphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc0MDIwNCwiZXhwIjoyMDkyMzE2MjA0fQ.5d5qUGirSWmOsOz-WrStpi0ZYcVcMWZ4Zf_rDdfEqOA';
const supabase = createClient(supabaseUrl, supabaseKey);

async function syncOldFile() {
    console.log("Fetching orders...");
    const { data: orders, error } = await supabase.from('orders').select('id, tracking_number, spx_sync_data').neq('status', 'Cancelled');
    if (error) { console.error(error); return; }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('C:\\Users\\Keneth\\Downloads\\a8abb2810b2a41268c17dcc30c908a32.xlsx');
    const worksheet = workbook.worksheets[0];

    let trackingCol = -1;
    let refCol = -1;
    let pickupTimeCol = 10;
    let paymentRoleCol = 32;
    let codAmountCol = 38;
    let estShippingFeeCol = 42;
    let basicShippingFeeCol = -1;
    let insuranceFeeCol = -1;
    let codServiceFeeCol = -1;
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
                else if (basicShippingFeeCol === -1 && val.includes('basic shipping fee')) basicShippingFeeCol = colNumber;
                else if (insuranceFeeCol === -1 && val.includes('insurance fee')) insuranceFeeCol = colNumber;
                else if (codServiceFeeCol === -1 && val.includes('cod service fee')) codServiceFeeCol = colNumber;
            });
            if (trackingCol !== -1 && refCol !== -1) foundHeaders = true;
            return;
        }

        if (!foundHeaders) return;

        const tCol = trackingCol !== -1 ? trackingCol : 1;
        const rCol = refCol !== -1 ? refCol : 3;
        
        const trackingNo = row.getCell(tCol).value?.toString().trim() || '';
        if (!trackingNo || trackingNo.toLowerCase().includes('tracking number')) return;
        
        const rawCustRef = row.getCell(rCol).value?.toString().trim() || ''; 
        const pickupTime = row.getCell(pickupTimeCol).value?.toString() || '';
        const paymentRole = row.getCell(paymentRoleCol).value?.toString() || '';
        const codAmount = parseFloat(row.getCell(codAmountCol).value?.toString() || '0') || 0;
        const estShippingFee = parseFloat(row.getCell(estShippingFeeCol).value?.toString() || '0') || 0;
        const basicShippingFee = basicShippingFeeCol !== -1 ? parseFloat(row.getCell(basicShippingFeeCol).value?.toString() || '0') || 0 : 0;
        const insuranceFee = insuranceFeeCol !== -1 ? parseFloat(row.getCell(insuranceFeeCol).value?.toString() || '0') || 0 : 0;
        const codServiceFee = codServiceFeeCol !== -1 ? parseFloat(row.getCell(codServiceFeeCol).value?.toString() || '0') || 0 : 0;

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
                if (!orderUpdates[fullId]) {
                    orderUpdates[fullId] = {
                        tracking_numbers: [],
                        cod_amount: 0,
                        estimated_shipping_fee: 0,
                        basic_shipping_fee: 0,
                        insurance_fee: 0,
                        cod_service_fee: 0,
                        scheduled_pickup_time: pickupTime,
                        payment_role: paymentRole
                    };
                }
                if (trackingNo && !orderUpdates[fullId].tracking_numbers.includes(trackingNo)) {
                    orderUpdates[fullId].tracking_numbers.push(trackingNo);
                }
                orderUpdates[fullId].cod_amount += codAmount;
                orderUpdates[fullId].estimated_shipping_fee += estShippingFee;
                orderUpdates[fullId].basic_shipping_fee += basicShippingFee;
                orderUpdates[fullId].insurance_fee += insuranceFee;
                orderUpdates[fullId].cod_service_fee += codServiceFee;
            }
        }
    });

    console.log(`Found ${Object.keys(orderUpdates).length} orders to update.`);

    for (const [fullId, data] of Object.entries(orderUpdates)) {
        console.log(`Updating ${fullId}...`);
        await supabase.from('orders').update({
            spx_sync_data: {
                scheduled_pickup_time: data.scheduled_pickup_time,
                estimated_shipping_fee: data.estimated_shipping_fee,
                basic_shipping_fee: data.basic_shipping_fee,
                insurance_fee: data.insurance_fee,
                cod_service_fee: data.cod_service_fee,
                cod_amount: data.cod_amount,
                payment_role: data.payment_role,
                service_type: 'Standard Service',
                collect_type: 'Pickup',
                payment_type: 'Pay by Cycle'
            }
        }).eq('id', fullId);
    }
    console.log("Done syncing old file!");
}

syncOldFile();
