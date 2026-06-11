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
  let updateCount = 0;
  let shippedCount = 0;
  let completedCount = 0;
  
  for (const row of data) {
    const trackingNo = row[0];
    const refNo = row[2];
    const name = row[15];
    const spxStatus = row[5];
    
    if (!trackingNo) continue;

    let newStatus = null;
    if (spxStatus === 'Delivered') {
      newStatus = 'Completed';
    } else if (spxStatus === 'In Transit' || spxStatus === 'Delivering') {
      newStatus = 'Shipped';
    }

    if (!newStatus) continue;

    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, status, customer_id, customers (full_name)')
      .eq('tracking_number', trackingNo);
      
    if (orders && orders.length > 0) {
       matchCount++;
       const order = orders[0];
       // Only update if status changed
       if (order.status !== newStatus) {
           const { error: updateError } = await supabase
             .from('orders')
             .update({ status: newStatus })
             .eq('id', order.id);
             
           if (!updateError) {
              updateCount++;
              if (newStatus === 'Completed') completedCount++;
              if (newStatus === 'Shipped') shippedCount++;
              console.log(`Updated Order ${order.id} (Tracking: ${trackingNo}, Name: ${order.customers?.full_name}) to ${newStatus}`);
           } else {
              console.error(`Error updating Order ${order.id}`, updateError);
           }
       }
    }
  }
  console.log(`Matched ${matchCount} orders. Updated ${updateCount} orders (${completedCount} Completed, ${shippedCount} Shipped).`);
}

run();
