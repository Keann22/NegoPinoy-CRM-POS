import fs from 'fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(
  envConfig.NEXT_PUBLIC_SUPABASE_URL,
  envConfig.SUPABASE_SERVICE_ROLE_KEY || envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  console.log('1. Finding pre-June and split-waybill legacy SPX orders...');
  let orders = [];
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from('orders')
      .select('id, tracking_number, balance_due, total_amount, amount_paid, payment_method, status, shipped_at, notes')
      .gt('balance_due', 0)
      .in('status', ['Shipped', 'Completed'])
      .range(page * 1000, (page + 1) * 1000 - 1);
    orders.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  const codOrders = orders.filter(o => o.payment_method === 'COD');
  const targetOrders = codOrders.filter(o => {
    const t = o.tracking_number || '';
    if (!t.toUpperCase().includes('SPEPH')) return false;
    const ship = o.shipped_at || '';
    return ship < '2026-10-01';
  });

  console.log(`Found ${targetOrders.length} legacy/split SPX orders to reconcile.`);
  const totalBal = targetOrders.reduce((s, o) => s + Number(o.balance_due), 0);
  console.log(`Total balance to clear: ₱${totalBal.toFixed(2)}`);

  console.log('2. Updating order statuses and balances...');
  let updated = 0;
  for (const o of targetOrders) {
    const nextStatus = o.status === 'Completed' ? 'Completed' : 'Payment Received (COD)';
    const existingNotes = o.notes ? `${o.notes}\n\n` : '';
    const note = `[${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} 10:15 PM] System:\nReconciled legacy/split SPX parcel (Balance cleared to ₱0).`;

    const { error } = await supabase
      .from('orders')
      .update({
        amount_paid: Number(o.total_amount) || Number(o.amount_paid) + Number(o.balance_due),
        balance_due: 0,
        status: nextStatus,
        notes: `${existingNotes}${note}`
      })
      .eq('id', o.id);

    if (error) {
      console.error(`Failed to update order ${o.id}:`, error.message);
    } else {
      updated++;
      console.log(`   Cleared order ${o.id.substring(0,8)} (${o.tracking_number}) -> ₱0 balance`);
    }
  }

  console.log(`\nSuccessfully reconciled ${updated} legacy/split SPX orders!`);
}

main().catch(console.error);
