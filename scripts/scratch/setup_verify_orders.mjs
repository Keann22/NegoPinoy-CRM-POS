import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // 1. Find a product with stock to spare
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, name, stock_level, selling_price, initial_unit_cost')
    .gt('stock_level', 5)
    .order('stock_level', { ascending: false })
    .limit(1);
  if (prodErr) throw prodErr;
  if (!products || products.length === 0) throw new Error('No product with stock found');
  const product = products[0];
  console.log('Using product:', product);

  // 2. Find or create a disposable test customer
  let { data: existingCustomer } = await supabase
    .from('customers')
    .select('id, full_name')
    .eq('full_name', 'ZZZ_TEST_VERIFY - DO NOT USE')
    .maybeSingle();

  let customerId;
  if (existingCustomer) {
    customerId = existingCustomer.id;
  } else {
    const { data: newCustomer, error: custErr } = await supabase
      .from('customers')
      .insert({ full_name: 'ZZZ_TEST_VERIFY - DO NOT USE' })
      .select('id')
      .single();
    if (custErr) throw custErr;
    customerId = newCustomer.id;
  }
  console.log('Using customer:', customerId);

  const price = product.selling_price || 100;

  async function createOrder(status) {
    const payload = {
      isEdit: false,
      customerId,
      orderStatus: status,
      totalAmount: price,
      paymentType: 'Full Payment',
      shippingDetails: 'TEST VERIFY - DO NOT SHIP',
      installmentMonths: null,
      monthlyPayment: null,
      orderDate: new Date().toISOString(),
      subtotal: price,
      totalDiscount: 0,
      insuranceFee: 0,
      balanceDue: 0,
      salesPersonId: null,
      salesPersonName: 'TEST SCRIPT',
      platformFees: 0,
      trackingNumber: null,
      amountPaid: price,
      proofUrl: null,
      orderItems: [{
        productId: product.id,
        productName: product.name,
        quantity: 1,
        costPriceAtSale: product.initial_unit_cost || 0,
        sellingPriceAtSale: price,
        discount: 0,
      }],
      overpayment: 0,
    };
    const { data: orderId, error } = await supabase.rpc('process_order_transaction', { payload });
    if (error) throw error;
    return orderId;
  }

  // Order A: Shipped, with an open product-tied issue -> tests "Mark as Completed"
  const orderA = await createOrder('Shipped');
  const { data: issueA } = await supabase.from('order_issues').insert({
    order_id: orderA, product_id: product.id, status: 'open',
    reported_by_name: 'TEST SCRIPT', out_of_stock_qty: 1,
  }).select('id').single();
  console.log('Order A (Shipped, for Mark-as-Completed test):', orderA, 'issue:', issueA.id);

  // Order B: On-Hold, with an open order-level issue (no product_id) + a custom message
  const orderB = await createOrder('On-Hold');
  const { data: issueB } = await supabase.from('order_issues').insert({
    order_id: orderB, status: 'open', reported_by_name: 'TEST SCRIPT',
  }).select('id').single();
  await supabase.from('order_issue_messages').insert({
    issue_id: issueB.id, sender_role: 'sales', sender_name: 'TEST SCRIPT',
    message: 'ORIGINAL REASON - should survive an unrelated edit',
  });
  console.log('Order B (On-Hold, for edit-preserves-issue test):', orderB, 'issue:', issueB.id);

  // Order C: Shipped, with an open product-tied issue -> tests "Process Return"
  const orderC = await createOrder('Shipped');
  const { data: issueC } = await supabase.from('order_issues').insert({
    order_id: orderC, product_id: product.id, status: 'open',
    reported_by_name: 'TEST SCRIPT', out_of_stock_qty: 1,
  }).select('id').single();
  console.log('Order C (Shipped, for Process-Return test):', orderC, 'issue:', issueC.id);

  console.log('\n--- SUMMARY ---');
  console.log(JSON.stringify({ productId: product.id, customerId, orderA, issueA: issueA.id, orderB, issueB: issueB.id, orderC, issueC: issueC.id }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
