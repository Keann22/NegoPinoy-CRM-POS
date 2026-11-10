import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const isApply = process.argv.includes('--apply');
const isDryRun = !isApply;

const envPath = path.resolve('.env.local');
if (!fs.existsSync(envPath)) {
  console.error('Missing .env.local file');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const envConfig = dotenv.parse(envContent);

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

async function fetchAllOrders() {
  const pageSize = 1000;
  let from = 0;
  let allOrders = [];
  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, customer_id, status, subtotal, total_discount, insurance_fee, shipping_fee, total_amount, amount_paid, balance_due, created_at')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    allOrders = allOrders.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return allOrders;
}

const round2 = (n) => Math.round(n * 100) / 100;

async function run() {
  console.log('========================================================');
  console.log(`MODE: ${isApply ? 'APPLY (LIVE WRITES)' : 'DRY RUN (NO LIVE WRITES)'}`);
  console.log('========================================================\n');

  console.log('Fetching all orders...');
  const orders = await fetchAllOrders();

  const candidates = [];
  for (const o of orders) {
    if (o.status === 'Cancelled') continue;

    const subtotal = Number(o.subtotal || 0);
    const discount = Number(o.total_discount || 0);
    const insurance = Number(o.insurance_fee || 0);
    const shipping = Number(o.shipping_fee || 0);
    const totalAmount = Number(o.total_amount || 0);
    const expected = subtotal - discount + insurance + shipping;
    const gap = round2(expected - totalAmount);

    if (gap > 0.01) {
      candidates.push({
        order: o,
        gap,
        newTotal: round2(totalAmount + gap),
        newPaid: round2(Number(o.amount_paid || 0) + gap),
        balanceDue: Number(o.balance_due || 0),
      });
    }
  }

  console.log(`Found ${candidates.length} non-cancelled orders with store credit gap.`);
  const totalGap = round2(candidates.reduce((sum, c) => sum + c.gap, 0));
  console.log(`Total gap amount to restore to sales/payments: ₱${totalGap.toFixed(2)}\n`);

  // Breakdown by month
  const byMonth = {};
  for (const c of candidates) {
    const d = new Date(c.order.created_at);
    const utc8 = new Date(d.getTime() + 8 * 3600 * 1000);
    const m = utc8.toISOString().slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { count: 0, sum: 0 };
    byMonth[m].count += 1;
    byMonth[m].sum = round2(byMonth[m].sum + c.gap);
  }

  console.log('Summary by month (Philippine Time UTC+8):');
  console.table(byMonth);

  // Anonymized candidate summary table (order short id, gap, status)
  const summaryTable = candidates.map((c, idx) => ({
    '#': idx + 1,
    orderShortId: c.order.id.slice(0, 7).toUpperCase(),
    status: c.order.status,
    createdAt: c.order.created_at.slice(0, 10),
    currentTotal: Number(c.order.total_amount).toFixed(2),
    gap: c.gap.toFixed(2),
    restoredTotal: c.newTotal.toFixed(2),
  }));
  console.log('\nOrders to be updated:');
  console.table(summaryTable);

  // Backup data to scripts/scratch/
  const scratchDir = path.resolve('scripts/scratch');
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(scratchDir, `store_credit_gap_backup_${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(candidates, null, 2), 'utf-8');
  console.log(`\nBackup of all touched orders saved to: ${backupPath}`);

  if (isDryRun) {
    console.log('\n[DRY RUN COMPLETE] No database changes were made.');
    console.log('To apply these changes, get explicit owner approval and run with --apply.');
    return;
  }

  console.log('\nApplying changes to live database...');
  let successCount = 0;

  for (const c of candidates) {
    const o = c.order;
    const gap = c.gap;

    // 1. Optimistic update of order: total_amount += gap, amount_paid += gap
    const { data: updatedOrder, error: orderErr } = await supabase
      .from('orders')
      .update({
        total_amount: c.newTotal,
        amount_paid: c.newPaid,
      })
      .eq('id', o.id)
      .eq('total_amount', o.total_amount)
      .select('id');

    if (orderErr || !updatedOrder || updatedOrder.length === 0) {
      console.error(`Failed to update order #${o.id.slice(0, 7)}:`, orderErr || 'Concurrent edit');
      continue;
    }

    // 2. Insert verified Store Credit payment
    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert({
        order_id: o.id,
        payment_date: o.created_at,
        amount: gap,
        payment_method: 'Store Credit',
        status: 'Verified',
        proof_url: null,
        notes: '[Backfill 2026-11: store credit used at order creation]',
      })
      .select('id')
      .single();

    if (payErr) {
      console.error(`Failed to insert payment for order #${o.id.slice(0, 7)}:`, payErr);
      // Rollback order
      await supabase.from('orders').update({
        total_amount: o.total_amount,
        amount_paid: o.amount_paid,
      }).eq('id', o.id);
      continue;
    }

    // 3. Insert order_logs
    await supabase.from('order_logs').insert({
      order_id: o.id,
      status: 'Store credit backfilled',
      user_name: 'Backfill script (2026-11)',
      notes: `Restored ₱${gap.toFixed(2)} store credit payment and order total`,
      snapshot_data: {
        amount: gap,
        paymentId: payment.id,
        previousTotal: o.total_amount,
        newTotal: c.newTotal,
      },
    });

    successCount += 1;
  }

  console.log(`\nSuccessfully applied backfill to ${successCount} of ${candidates.length} orders.`);
}

run().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
