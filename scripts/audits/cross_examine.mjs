import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const wb = xlsx.readFile('spx shipped/2cdee0b6c9c34b15915dbcc398dc62a7.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, {header: 1}).slice(2);

  const { data: orders } = await supabase.from('orders').select('id, status, tracking_number, customer_id, customers (full_name)');

  const orderMap = new Map();
  for (const o of orders) {
    const shortId = o.id.substring(0, 7).toUpperCase();
    orderMap.set(shortId, o);
  }

  let markdown = `# SPX Order Matches

| SPX Tracking | SPX Ref No | SPX Name | DB Match Name | DB Order ID | SPX Status | Current DB Status | Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
`;

  let matchCount = 0;
  let actionCount = 0;

  for (const row of data) {
    const trackingNo = row[0];
    const refNoStr = row[2] || '';
    const spxName = row[15] || '';
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
        matchCount++;
        const dbName = dbOrder.customers?.full_name || 'N/A';
        
        let newStatus = null;
        if (spxStatus === 'Delivered') newStatus = 'Completed';
        else if (spxStatus === 'In Transit' || spxStatus === 'Delivering') newStatus = 'Shipped';

        let action = 'None';
        if (newStatus && newStatus !== dbOrder.status) {
           action = `**Update to ${newStatus}**`;
           actionCount++;
        }

        markdown += `| ${trackingNo} | ${refNoStr} | ${spxName} | ${dbName} | \`${dbOrder.id.substring(0,7)}\` | ${spxStatus} | ${dbOrder.status} | ${action} |\n`;
    }
  }

  markdown += `\n**Total Matches Found:** ${matchCount} out of ${data.length}\n**Total Actions Needed:** ${actionCount}`;
  
  const artifactPath = 'C:/Users/Keneth/.gemini/antigravity/brain/58727d3a-c32d-4cb0-9d1b-7c814ad64984/spx_matches.md';
  fs.writeFileSync(artifactPath, markdown);
  console.log("Artifact created");
}

run();
