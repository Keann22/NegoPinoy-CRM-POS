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

  const { data: orders } = await supabase.from('orders').select('id, status, tracking_number, customer_id');

  const orderMap = new Map();
  for (const o of orders) {
    const shortId = o.id.substring(0, 7).toUpperCase();
    orderMap.set(shortId, o);
  }

  let updateCount = 0;

  for (const row of data) {
    const trackingNo = row[0];
    const refNoStr = row[2] || '';
    const spxStatus = row[5];

    if (!trackingNo) continue;

    const match = refNoStr.match(/#([A-Z0-9]{7})/i);
    const shortId = match ? match[1].toUpperCase() : null;

    let dbOrder = null;
    if (shortId && orderMap.has(shortId)) {
        dbOrder = orderMap.get(shortId);
    } else {
        dbOrder = orders.find(o => o.tracking_number === trackingNo);
    }

    if (dbOrder) {
        let newStatus = null;
        if (spxStatus === 'Delivered') newStatus = 'Completed';
        else if (spxStatus === 'In Transit' || spxStatus === 'Delivering') newStatus = 'Shipped';

        const needsStatusUpdate = newStatus && newStatus !== dbOrder.status;
        const needsTrackingUpdate = dbOrder.tracking_number !== trackingNo;

        if (needsStatusUpdate || needsTrackingUpdate) {
           const updates = {};
           if (needsStatusUpdate) updates.status = newStatus;
           if (needsTrackingUpdate) updates.tracking_number = trackingNo;

           const { error: updateError } = await supabase
             .from('orders')
             .update(updates)
             .eq('id', dbOrder.id);
             
           if (!updateError) {
              updateCount++;
              if (needsStatusUpdate) dbOrder.status = newStatus;
              if (needsTrackingUpdate) dbOrder.tracking_number = trackingNo;
              console.log(`Updated Order ${dbOrder.id.substring(0,7)}: ${JSON.stringify(updates)}`);
           } else {
              console.error(`Error updating Order ${dbOrder.id}`, updateError);
           }
        }
    }
  }

  console.log(`Successfully updated ${updateCount} orders (Status and/or Tracking Number).`);
}

run();
