import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const wbFinancial = xlsx.readFile('spx tracking/account_transaction_list_ec9f15a993c64c419b49ff4d7c36c55d.xlsx');
  const sheetFinancial = wbFinancial.Sheets[wbFinancial.SheetNames[0]];
  const financialData = xlsx.utils.sheet_to_json(sheetFinancial, {header: 1}).slice(1);

  const missingTracking = 'SPEPH062176215096';
  const shortId = 'FA9251E';

  const { data: orders } = await supabase.from('orders').select('*');
  const order = orders.find(o => o.id.toUpperCase().startsWith(shortId));
  if (!order) {
      console.log('Order not found');
      return;
  }

  let cod = 0;
  let shippingFee = 0;
  
  for (const row of financialData) {
      if (row[2] === missingTracking) {
          const amount = Math.abs(parseFloat(String(row[4]).replace('+', '').replace(',', '')));
          if (row[1] === 'COD') cod += amount;
          if (row[1] === 'Shipping Fee') shippingFee += amount;
      }
  }

  console.log(`Processing Missing Tracking ${missingTracking} for Order ${shortId}`);
  console.log(`COD: ${cod}, Shipping Fee: ${shippingFee}`);
  
  const balanceDue = order.balance_due || 0;
  const newAmountPaid = (order.amount_paid || 0) + cod;
  const newBalanceDue = Math.max(0, balanceDue - cod);

  // Log Payment
  if (cod > 0) {
    await supabase.from('payments').insert({
      order_id: order.id,
      payment_date: new Date().toISOString(),
      amount: cod,
      payment_method: 'SPX COD Remittance',
      notes: `SPX Tracking: ${missingTracking}`
    });
  }

  // Log Expense
  if (shippingFee > 0) {
    await supabase.from('expenses').insert({
      expense_date: new Date().toISOString(),
      amount: shippingFee,
      category: 'Processing Fee',
      description: `SPX Courier Fee for Order #${shortId} (Tracking 2)`
    });
  }

  // Update Order
  await supabase.from('orders').update({
    amount_paid: newAmountPaid,
    balance_due: newBalanceDue
  }).eq('id', order.id);
  
  console.log('Fixed order', shortId);
}

run();
