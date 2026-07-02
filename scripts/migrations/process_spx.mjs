import fs from 'fs';
import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const isDryRun = process.argv.includes('--dry-run');

async function run() {
  console.log(`Starting SPX Processing... ${isDryRun ? '[DRY RUN MODE]' : '[EXECUTION MODE]'}`);
  
  // 1. Find the Excel File
  const spxDir = 'spx tracking';
  const files = fs.readdirSync(spxDir).filter(f => f.endsWith('.xlsx'));
  
  if (files.length === 0) {
    console.error("No .xlsx file found in the 'spx tracking' directory.");
    process.exit(1);
  }
  
  const targetFile = `${spxDir}/${files[0]}`;
  console.log(`Reading file: ${targetFile}`);

  const workbook = xlsx.readFile(targetFile);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  const transactions = data.slice(1).filter(row => row.length > 0 && row[0]);
  const byTracking = {};

  for (const row of transactions) {
    const [txnId, txnType, trackingNumber, statusTime, txnAmountStr] = row;
    if (!trackingNumber || trackingNumber === 'Tracking Number') continue;

    const amount = parseFloat(String(txnAmountStr).replace('+', '').replace(',', ''));

    if (!byTracking[trackingNumber]) {
      byTracking[trackingNumber] = {
        trackingNumber,
        cod: 0,
        shippingFee: 0,
      };
    }

    if (txnType === 'COD') {
      byTracking[trackingNumber].cod += amount;
    } else if (txnType === 'Shipping Fee') {
      // Shipping fee is negative in the spreadsheet, e.g. -280
      // We store it as a positive expense amount
      byTracking[trackingNumber].shippingFee += Math.abs(amount);
    }
  }

  const trackingNumbers = Object.keys(byTracking);
  console.log(`Found ${trackingNumbers.length} unique tracking numbers in SPX file.`);

  // 2. Fetch Orders from Supabase
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, tracking_number, amount_paid, balance_due, status, total_amount, payment_method, installment_months, monthly_payment, payments(id, payment_method)')
    .in('tracking_number', trackingNumbers);

  if (error) {
    console.error("Error fetching orders:", error);
    process.exit(1);
  }

  console.log(`Matched ${orders.length} orders in the database.`);

  let successCount = 0;
  let discrepancies = [];

  for (const order of orders) {
    const spxData = byTracking[order.tracking_number];
    
    // Check for discrepancy between expected balance and what was collected
    let balanceDue = order.balance_due || 0;
    if (order.payment_method === 'Installment' || order.payment_method === 'Lay-away') {
      const expectedDownpayment = (order.total_amount || 0) - ((order.installment_months || 0) * (order.monthly_payment || 0));
      balanceDue = Math.max(0, expectedDownpayment - (order.amount_paid || 0));
    }
    
    console.log(`\nProcessing Order #${order.id.substring(0,7).toUpperCase()} (Tracking: ${order.tracking_number})`);
    
    // Prevent double logging
    const hasSpxPayment = order.payments?.some(p => p.payment_method === 'SPX COD Remittance');
    if (hasSpxPayment) {
      console.log(` - SKIPPED: SPX COD Remittance already recorded for this order.`);
      continue;
    }

    console.log(` - Expected Balance Due: ₱${balanceDue.toFixed(2)}`);
    console.log(` - SPX Collected (COD):  ₱${spxData.cod.toFixed(2)}`);
    console.log(` - SPX Shipping Fee:     ₱${spxData.shippingFee.toFixed(2)}`);
    
    if (Math.abs(balanceDue - spxData.cod) > 0.01) {
       console.log(`   [WARNING] Discrepancy found! SPX collected ₱${spxData.cod} but expected ₱${balanceDue}`);
       discrepancies.push({
           orderId: order.id,
           tracking: order.tracking_number,
           expected: balanceDue,
           collected: spxData.cod
       });
    }

    if (!isDryRun) {
      let codToApply = Math.min(balanceDue, spxData.cod);
      const excessCod = spxData.cod - codToApply;
      
      const newAmountPaid = (order.amount_paid || 0) + codToApply;
      const newBalanceDue = Math.max(0, (order.balance_due || 0) - codToApply);
      const newStatus = 'Payment Received (COD)';

      // Log Payment
      if (codToApply > 0) {
        await supabase.from('payments').insert({
          order_id: order.id,
          payment_date: new Date().toISOString(),
          amount: codToApply,
          payment_method: 'SPX COD Remittance',
          notes: `SPX Tracking: ${order.tracking_number}`
        });
      }

      // Log Expense
      // Excess COD offsets the shipping fee (which is negative in spxData)
      let effectiveShippingFee = spxData.shippingFee + excessCod;
      if (effectiveShippingFee < 0) {
        await supabase.from('expenses').insert({
          amount: Math.abs(effectiveShippingFee),
          category: 'Shipping Fee',
          description: `Shipping Fee for SPX ${order.tracking_number}`,
          date: new Date().toISOString(),
          payment_method: 'SPX Balance Deduction',
          recorded_by: null // script run
        });
      }

      // Update Order
      await supabase.from('orders').update({
        amount_paid: newAmountPaid,
        balance_due: newBalanceDue,
        status: newStatus
      }).eq('id', order.id);

      successCount++;
    }
  }

  if (isDryRun) {
    console.log('\n--- DRY RUN COMPLETED ---');
    console.log(`Would have updated ${orders.length} orders.`);
    if (discrepancies.length > 0) {
        console.log(`Found ${discrepancies.length} orders with discrepancies between expected balance and collected COD.`);
    }
  } else {
    console.log(`\n--- EXECUTION COMPLETED ---`);
    console.log(`Successfully updated ${successCount} orders.`);
  }
}

run();
