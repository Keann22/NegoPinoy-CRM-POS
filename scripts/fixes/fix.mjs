import fs from 'fs';
import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const files = fs.readdirSync('spx tracking').filter(f => f.endsWith('.xlsx'));
  const workbook = xlsx.readFile('spx tracking/' + files[0]);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  const byTracking = {};
  data.slice(1).forEach(row => {
    if (!row[2] || row[2] === 'Tracking Number') return;
    const amt = parseFloat(String(row[4]).replace('+', '').replace(',', ''));
    if (!byTracking[row[2]]) byTracking[row[2]] = 0;
    if (row[1] === 'COD') byTracking[row[2]] += amt;
  });
  
  const trackingNumbers = Object.keys(byTracking);
  const { data: orders } = await supabase.from('orders').select('id, tracking_number, amount_paid').in('tracking_number', trackingNumbers);
  
  for (const o of orders) {
    const cod = byTracking[o.tracking_number];
    const fixed = o.amount_paid - cod;
    console.log(`Fixing order ${o.id.substring(0,7)} from ${o.amount_paid} to ${fixed}`);
    await supabase.from('orders').update({amount_paid: fixed}).eq('id', o.id);
  }
}
run();
