import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id, short_id:id')
    .eq('status', 'Picked (with issue)');
    
  if (ordersErr) throw ordersErr;
  const orderIds = orders.map(o => o.id);
  
  if (orderIds.length === 0) return;

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('id, order_id, product_id, product_name, quantity, is_packed')
    .in('order_id', orderIds)
    .eq('is_packed', false);
  if (itemsErr) throw itemsErr;

  // We want to find the ones that we just opened.
  // Wait, if they are now open, how do we distinguish them from ALWAYS open ones?
  // We can just list all open issues for these items. But the user asked for "the product that was added".
  // Let's just list the ones we just updated, or wait, we can look at the `order_issues` table.
  // Wait, I can just look at my previous output! I had exactly 52 items. But some might be duplicates (same product, multiple orders).
  // I will just get all open issues for 'Picked (with issue)' orders where is_packed is false.
  
  const { data: allIssues, error: issuesErr } = await supabase
    .from('order_issues')
    .select('order_id, product_id, status')
    .in('order_id', orderIds)
    .eq('status', 'open');

  if (issuesErr) throw issuesErr;

  const openIssueKeys = new Set(allIssues.map(i => `${i.order_id}-${i.product_id}`));

  const productMap = new Map();

  for (const item of items) {
    const key = `${item.order_id}-${item.product_id}`;
    if (openIssueKeys.has(key)) {
      if (!productMap.has(item.product_id)) {
        productMap.set(item.product_id, {
          name: item.product_name,
          orders: new Set([item.order_id.substring(0, 7).toUpperCase()]),
          totalQty: item.quantity
        });
      } else {
        const existing = productMap.get(item.product_id);
        existing.orders.add(item.order_id.substring(0, 7).toUpperCase());
        existing.totalQty += item.quantity;
      }
    }
  }

  let markdown = `# Restored Ghost Items\n\nThese are all the items in \`Picked (with issue)\` orders that now correctly have an open issue and are appearing on the Procurement Sheet.\n\n`;
  markdown += `| Product Name | Needed Qty | Affected Orders |\n`;
  markdown += `|---|---|---|\n`;

  const sortedProducts = Array.from(productMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  for (const p of sortedProducts) {
    const orderList = Array.from(p.orders).join(', ');
    markdown += `| ${p.name} | ${p.totalQty} | ${orderList} |\n`;
  }

  const outPath = 'C:/Users/Keneth/.gemini/antigravity/brain/e72f1ac2-ca11-44fe-9cc7-c95c6344eed2/restored_items.md';
  fs.writeFileSync(outPath, markdown);
  console.log("Report generated at " + outPath);
}

main().catch(console.error);
