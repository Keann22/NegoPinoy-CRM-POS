import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Replay the exact validation path of POST /api/inventory/procurement-request
// for the most recent real-world report, WITHOUT writing anything, to find
// where (if anywhere) it would throw / reject.
const requests = [
  { productId: 'c4606b8b-27d6-4b4d-acb6-74447cb213b5', requestedQty: 1, orderId: '2dd4b650-0efd-4ce5-9f0b-be89289f938a' }
];

async function simulate() {
  const uniqueOrderIds = new Set();
  for (const r of requests) if (r.orderId) uniqueOrderIds.add(r.orderId.trim());

  const isFullUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

  for (const rawOrderId of uniqueOrderIds) {
    console.log('Checking order:', rawOrderId);
    const orderQuery = supabase.from('orders').select('id');
    const { data: orderData, error: orderErr } = isFullUuid(rawOrderId)
      ? await orderQuery.eq('id', rawOrderId).limit(1).maybeSingle()
      : await orderQuery.filter('id::text', 'ilike', `${rawOrderId}%`).limit(1).maybeSingle();

    if (orderErr) { console.log('ORDER LOOKUP ERROR:', orderErr.message); return; }
    if (!orderData) { console.log('ORDER NOT FOUND -> would 400'); return; }
    console.log('  found order id:', orderData.id);

    const realOrderId = orderData.id;
    const requestsForThisOrder = requests.filter(r => r.orderId?.trim() === rawOrderId);

    const { data: itemsData, error: itemsErr } = await supabase
      .from('order_items')
      .select('product_id, quantity')
      .eq('order_id', realOrderId);

    if (itemsErr) { console.log('ORDER ITEMS ERROR:', itemsErr.message); return; }
    console.log('  order_items count:', itemsData?.length, JSON.stringify(itemsData));

    const orderProductIds = itemsData?.map(i => i.product_id) || [];

    const { data: bundleData, error: bundleErr } = await supabase
      .from('products')
      .select('id, assembly_recipe')
      .in('id', orderProductIds)
      .not('assembly_recipe', 'is', null);
    if (bundleErr) console.log('BUNDLE QUERY ERROR:', bundleErr.message);
    console.log('  bundleData:', JSON.stringify(bundleData));

    const maxAllowedMap = new Map();
    if (itemsData) {
      for (const item of itemsData) {
        maxAllowedMap.set(item.product_id, (maxAllowedMap.get(item.product_id) || 0) + item.quantity);
        const bundle = bundleData?.find(b => b.id === item.product_id);
        if (bundle && Array.isArray(bundle.assembly_recipe)) {
          for (const comp of bundle.assembly_recipe) {
            const compId = comp.component_id || comp.productId;
            if (compId) {
              const compQty = comp.quantity || 1;
              maxAllowedMap.set(compId, (maxAllowedMap.get(compId) || 0) + (item.quantity * compQty));
            }
          }
        }
      }
    }
    console.log('  maxAllowedMap:', JSON.stringify(Array.from(maxAllowedMap.entries())));

    for (const r of requestsForThisOrder) {
      const pid = r.productId;
      if (!maxAllowedMap.has(pid)) {
        const { data: pData } = await supabase.from('products').select('name').eq('id', pid).single();
        console.log(`  WOULD REJECT: Product "${pData?.name}" is not part of Order ${rawOrderId}`);
        return;
      }
      const maxAllowed = maxAllowedMap.get(pid);
      if (r.requestedQty > maxAllowed) {
        console.log(`  WOULD REJECT: requestedQty ${r.requestedQty} > maxAllowed ${maxAllowed}`);
        return;
      }
      console.log(`  OK: product ${pid} requestedQty ${r.requestedQty} <= maxAllowed ${maxAllowed}`);
    }
  }

  console.log('\nValidation passed for all requests -- would proceed to insert STAFF_DRAFT.');

  // Check the "find existing STAFF_DRAFT" step too (read-only)
  const { data: existingPo, error: existErr } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('notes', 'STAFF_DRAFT')
    .eq('status', 'pending_receipt')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  console.log('existingPo:', existingPo, 'existErr:', existErr?.message, existErr?.code);
}

simulate().catch(e => console.log('UNCAUGHT:', e));
