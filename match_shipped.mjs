import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const wb = xlsx.readFile('spx shipped/2cdee0b6c9c34b15915dbcc398dc62a7.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, {header: 1}).slice(2);
  
  let matchCount = 0;
  for (const row of data) {
    const trackingNo = row[0];
    const refNo = row[2];
    const name = row[15];
    const spxStatus = row[5];
    
    if (!trackingNo) continue;

    // Try to find by tracking number
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, status, customer_id, customers (full_name)')
      .eq('tracking_number', trackingNo);
      
    if (orders && orders.length > 0) {
       console.log(`Match by Tracking: ${trackingNo} -> DB Order ID: ${orders[0].id}, Name: ${orders[0].customers?.full_name}, SPX Status: ${spxStatus}`);
       matchCount++;
    } else {
       // try searching by name in customers table
       // console.log(`No match for ${trackingNo} / ${refNo} / ${name}`);
    }
  }
  console.log(`Matched ${matchCount} out of ${data.length} rows using tracking_number.`);
}

run();
