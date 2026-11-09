import fs from 'fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(
  envConfig.NEXT_PUBLIC_SUPABASE_URL,
  envConfig.SUPABASE_SERVICE_ROLE_KEY || envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const filePath = 'C:/Users/Keneth/Downloads/account_transaction_list_b65918debda5470d8b1e0ab77546cdd5.xlsx';

async function main() {
  console.log('1. Reading Excel file to identify confirmed RTS parcels...');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

  const excelTrackings = new Map();
  for (let r = 2; r <= ws.rowCount; r++) {
    const t = ws.getRow(r).getCell(3).value?.toString().trim();
    const type = ws.getRow(r).getCell(2).value?.toString().trim();
    const amt = parseFloat(ws.getRow(r).getCell(5).value?.toString() || '0');
    if (t && t !== '-') {
      const up = t.toUpperCase();
      if (!excelTrackings.has(up)) excelTrackings.set(up, []);
      excelTrackings.get(up).push({ type, amt, row: r });
    }
  }

  console.log('2. Fetching unpaid orders from database...');
  let unpaid = [];
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from('orders')
      .select('id, tracking_number, balance_due, total_amount, payment_method, status, notes')
      .gt('balance_due', 0)
      .in('status', ['Shipped', 'Completed'])
      .range(page * 1000, (page + 1) * 1000 - 1);
    unpaid.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  const rtsOrders = [];
  for (const o of unpaid) {
    if (o.payment_method === 'Installment' || o.payment_method === 'Lay-away') continue;
    const t = o.tracking_number ? o.tracking_number.trim() : '';
    if (!t) continue;
    const up = t.toUpperCase();
    if (excelTrackings.has(up)) {
      const rows = excelTrackings.get(up);
      const hasCod = rows.some(r => r.type.toLowerCase() === 'cod' && r.amt > 0);
      if (!hasCod) {
        rtsOrders.push(o);
      }
    }
  }

  console.log(`Found ${rtsOrders.length} confirmed RTS orders to update to 'Returned'.`);
  const totalBalance = rtsOrders.reduce((sum, o) => sum + Number(o.balance_due), 0);
  console.log(`Total balance being cleared: ₱${totalBalance.toFixed(2)}`);

  console.log('3. Updating order statuses...');
  let updatedCount = 0;
  let errors = 0;

  for (const order of rtsOrders) {
    try {
      const existingNotes = order.notes ? `${order.notes}\n\n` : '';
      const rtsNote = `[${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} 10:00 PM] System:\nMarked as Returned. SPX financial statement confirmed ₱0 COD collected (RTS / Delivery Failed).`;
      const newNotes = `${existingNotes}${rtsNote}`;

      const { error } = await supabase
        .from('orders')
        .update({
          status: 'Returned',
          notes: newNotes
        })
        .eq('id', order.id);

      if (error) throw error;
      updatedCount++;
      process.stdout.write(`   Updated ${updatedCount} / ${rtsOrders.length} (${order.id.substring(0, 8)})\n`);
    } catch (err) {
      errors++;
      console.error(`Failed to update order ${order.id}:`, err.message);
    }
  }

  console.log('\n=== RTS UPDATE COMPLETE ===');
  console.log(`Successfully updated to 'Returned': ${updatedCount}`);
  console.log(`Errors: ${errors}`);
  console.log(`Cleared Outstanding Receivables: ₱${totalBalance.toFixed(2)}`);
}

main().catch(console.error);
