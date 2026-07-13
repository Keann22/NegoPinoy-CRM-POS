import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sgkjdtwqqbrpmrfukhja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNna2pkdHdxcWJycG1yZnVraGphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc0MDIwNCwiZXhwIjoyMDkyMzE2MjA0fQ.5d5qUGirSWmOsOz-WrStpi0ZYcVcMWZ4Zf_rDdfEqOA';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixCourierFeesBetter() {
  console.log('Fetching orders with SPX COD Remittance payments...');
  
  // 1. Fetch payments that came from SPX
  const { data: payments, error: paymentError } = await supabase
    .from('payments')
    .select('order_id, amount')
    .eq('payment_method', 'SPX COD Remittance');

  if (paymentError) return;

  const spxPaymentsByOrder = {};
  for (const p of payments) {
    spxPaymentsByOrder[p.order_id] = (spxPaymentsByOrder[p.order_id] || 0) + p.amount;
  }
  const orderIds = Object.keys(spxPaymentsByOrder);

  // 2. Fetch orders and order_items to calculate exact order total
  const { data: orders, error: orderError } = await supabase
    .from('orders')
    .select('id, total_discount, insurance_fee')
    .in('id', orderIds);

  if (orderError) {
    console.error("Order error", orderError);
    return;
  }

  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select('order_id, quantity, selling_price_at_sale, discount')
    .in('order_id', orderIds);

  if (itemsError) {
    console.error("Items error", itemsError);
    return;
  }

  const { data: expenses } = await supabase
    .from('expenses')
    .select('description')
    .ilike('description', 'SPX Courier Fee%');
  
  const existingExpenseDesc = new Set(expenses?.map(e => e.description) || []);

  let fixedCount = 0;

  for (const order of orders) {
    const items = orderItems.filter(i => i.order_id === order.id);
    let subtotal = 0;
    for (const item of items) {
      subtotal += ((item.selling_price_at_sale || 0) - (item.discount || 0)) * (item.quantity || 1);
    }
    
    let totalOrderValue = subtotal - (order.total_discount || 0);
    if (order.insurance_fee) totalOrderValue += order.insurance_fee;
    
    const spxCollected = spxPaymentsByOrder[order.id];
    
    if (spxCollected > totalOrderValue + 1) { // +1 for floating point safety
      const courierFee = spxCollected - totalOrderValue;
      const shortOrderId = order.id.substring(0, 7).toUpperCase();
      const desc = `SPX Courier Fee for Order #${shortOrderId}`;
      
      if (!existingExpenseDesc.has(desc)) {
        console.log(`Fixing Order ${shortOrderId}: SPX Collected P${spxCollected.toFixed(2)}, Order Value P${totalOrderValue.toFixed(2)}, Missing Fee P${courierFee.toFixed(2)}`);
        
        await supabase.from('expenses').insert({
          amount: courierFee,
          category: 'Processing Fee',
          expense_date: new Date().toISOString(),
          description: desc
        });
        fixedCount++;
      }
    }
  }
  console.log(`Finished! Retroactively added ${fixedCount} missing courier fees.`);
}

fixCourierFeesBetter();
