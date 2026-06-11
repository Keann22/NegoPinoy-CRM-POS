import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // 1. Get the mapping from shipped file
  const wbShipped = xlsx.readFile('spx shipped/2cdee0b6c9c34b15915dbcc398dc62a7.xlsx');
  const sheetShipped = wbShipped.Sheets[wbShipped.SheetNames[0]];
  const shippedData = xlsx.utils.sheet_to_json(sheetShipped, {header: 1}).slice(2);

  const trackingToOrder = {};
  for (const row of shippedData) {
     const trackingNo = row[0];
     const refNoStr = row[2] || '';
     const match = refNoStr.match(/#([A-Z0-9]{7})/i);
     if (match && trackingNo) {
        trackingToOrder[trackingNo] = match[1].toUpperCase();
     }
  }

  // 2. Read financial tracking file
  const wbFinancial = xlsx.readFile('spx tracking/account_transaction_list_ec9f15a993c64c419b49ff4d7c36c55d.xlsx');
  const sheetFinancial = wbFinancial.Sheets[wbFinancial.SheetNames[0]];
  const financialData = xlsx.utils.sheet_to_json(sheetFinancial, {header: 1}).slice(1);

  const byOrder = {};

  for (const row of financialData) {
     const txnId = row[0];
     const txnType = row[1];
     const trackingNo = row[2];
     const txnAmountStr = row[4];

     if (!trackingNo || !txnId) continue;
     
     const shortId = trackingToOrder[trackingNo];
     if (!shortId) continue;

     const amount = parseFloat(String(txnAmountStr).replace('+', '').replace(',', ''));

     if (!byOrder[shortId]) {
         byOrder[shortId] = { cod: 0, shippingFee: 0, trackings: new Set() };
     }

     byOrder[shortId].trackings.add(trackingNo);

     if (txnType === 'COD') {
         byOrder[shortId].cod += amount;
     } else if (txnType === 'Shipping Fee') {
         byOrder[shortId].shippingFee += Math.abs(amount);
     }
  }

  // 3. Compare with DB
  const { data: orders } = await supabase.from('orders').select('id, amount_paid, balance_due, tracking_number');
  
  let processCount = 0;

  for (const [shortId, data] of Object.entries(byOrder)) {
      if (data.trackings.size > 1) {
          console.log(`Order ${shortId} has multiple tracking numbers in financials:`, Array.from(data.trackings));
          
          const order = orders.find(o => o.id.toUpperCase().startsWith(shortId));
          if (!order) {
              console.log("  Order not found in DB!");
              continue;
          }
          
          // Let's see what was already paid. The previous script added COD for the ONE tracking number that was stored in the DB.
          // Which tracking number was that?
          console.log(`  Current Amount Paid: ${order.amount_paid}, Balance Due: ${order.balance_due}`);
          console.log(`  Total COD from SPX: ${data.cod}, Total Shipping Fee from SPX: ${data.shippingFee}`);
      }
  }
}

run();
