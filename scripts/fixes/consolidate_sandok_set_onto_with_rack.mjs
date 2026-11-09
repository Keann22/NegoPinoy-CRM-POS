// One-time SKU consolidation (2026-10-24).
// "7pc Stainless Sandok Set" (plain) got variants on Oct 23, but every open
// order, the PDD online order and the stock stayed on the plain record, so the
// "With Rack" row showed need-to-buy with no in-transit chip.
// Moves open order lines, their order issues, open PO lines (incl. staff
// draft) and per-warehouse stock from the plain record onto "With Rack".
// Completed orders and stock-movement history stay on the plain record.
//
//   node scripts/fixes/consolidate_sandok_set_onto_with_rack.mjs          (dry run)
//   node scripts/fixes/consolidate_sandok_set_onto_with_rack.mjs --apply
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const FROM = 'f7654ace-271a-4828-911e-0552658c1547'; // 7pc Stainless Sandok Set (plain)
const TO = '1ffe674b-7ad1-4d12-9b35-500a82c0588d';   // 7pc Stainless Sandok Set - With Rack
const CLOSED = ['Completed', 'Cancelled', 'Canceled', 'Returned', 'Refunded', 'Shipped', 'Delivered'];
const REASON = 'SKU consolidation: 7pc Stainless Sandok Set moved onto its "With Rack" variant';

async function req(method, path, body, prefer) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method, headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const get = (p) => req('GET', p);
const patch = (p, b) => req('PATCH', p, b, 'return=representation');
const inList = (ids) => `(${ids.join(',')})`;

async function snapshot() {
  const products = await get(`products?id=in.${inList([FROM, TO])}&select=id,name,variant_name,stock_level`);
  const pws = await get(`product_warehouse_stock?product_id=in.${inList([FROM, TO])}&select=id,product_id,warehouse_id,stock_level`);
  const orderItems = await get(`order_items?product_id=eq.${FROM}&select=id,order_id,quantity,is_packed,product_name,orders(status)`);
  const issues = await get(`order_issues?product_id=eq.${FROM}&select=id,order_id,status,issue_type,po_id`);
  const poItems = await get(`purchase_order_items?product_id=in.${inList([FROM, TO])}&select=id,product_id,po_id,expected_qty,received_qty,status,purchase_orders(notes,platform_order_no)`);
  return { products, pws, orderItems, issues, poItems };
}

const before = await snapshot();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(`scripts/reports/sandok_consolidation_before_${stamp}.json`, JSON.stringify(before, null, 2));

const openItems = before.orderItems.filter((o) => !CLOSED.includes(o.orders?.status));
const keptItems = before.orderItems.filter((o) => CLOSED.includes(o.orders?.status));
const movedOrderIds = new Set(openItems.map((o) => o.order_id));
// Order-linked issues follow their order; the PO discrepancy / staff message
// (no order) follow the PO line, which moves too.
const issuesToMove = before.issues.filter((i) => !i.order_id || movedOrderIds.has(i.order_id));
const poToMove = before.poItems.filter((p) => p.product_id === FROM && p.status === 'pending_receipt');
const stockToMove = before.pws.filter((w) => w.product_id === FROM && w.stock_level !== 0);

console.log(`Open order lines to move: ${openItems.length}  (kept as history: ${keptItems.length})`);
openItems.forEach((o) => console.log(`  ${o.order_id.slice(0, 8)} ${o.orders?.status} x${o.quantity}`));
console.log(`Order issues to move: ${issuesToMove.length} of ${before.issues.length}`);
console.log(`Open PO lines to move: ${poToMove.length}`);
poToMove.forEach((p) => console.log(`  ${p.purchase_orders?.platform_order_no || p.purchase_orders?.notes} ${p.received_qty}/${p.expected_qty}`));
console.log('Warehouse stock to move:', stockToMove.map((w) => `${w.warehouse_id.slice(0, 8)}=${w.stock_level}`).join(', '));
const dupPo = before.poItems.filter((p) => p.product_id === TO && p.status === 'pending_receipt');
if (dupPo.length) console.log('WARNING: With Rack already has open PO lines:', JSON.stringify(dupPo));

if (!APPLY) { console.log('\nDry run only. Re-run with --apply.'); process.exit(0); }

if (openItems.length) await patch(`order_items?id=in.${inList(openItems.map((o) => o.id))}&product_id=eq.${FROM}`, { product_id: TO });
if (issuesToMove.length) await patch(`order_issues?id=in.${inList(issuesToMove.map((i) => i.id))}&product_id=eq.${FROM}`, { product_id: TO });
if (poToMove.length) await patch(`purchase_order_items?id=in.${inList(poToMove.map((p) => p.id))}&product_id=eq.${FROM}`, { product_id: TO });

for (const w of stockToMove) {
  const qty = w.stock_level;
  // Relative moves, so a sale landing mid-script isn't overwritten.
  await req('POST', 'rpc/increment_warehouse_stock', { p_product_id: FROM, p_warehouse_id: w.warehouse_id, p_qty: -qty, p_new_unit_cost: null });
  await req('POST', 'rpc/increment_warehouse_stock', { p_product_id: TO, p_warehouse_id: w.warehouse_id, p_qty: qty, p_new_unit_cost: null });
  await req('POST', 'inventory_movements', [
    { product_id: FROM, quantity_change: -qty, movement_type: 'adjustment', reason: REASON, warehouse_id: w.warehouse_id, performed_by_name: 'System (SKU consolidation)' },
    { product_id: TO, quantity_change: qty, movement_type: 'adjustment', reason: REASON, warehouse_id: w.warehouse_id, performed_by_name: 'System (SKU consolidation)' },
  ], 'return=minimal');
}

const after = await snapshot();
fs.writeFileSync(`scripts/reports/sandok_consolidation_after_${stamp}.json`, JSON.stringify(after, null, 2));
console.log('\nAFTER');
after.products.forEach((p) => console.log(`  ${p.name}: stock ${p.stock_level}`));
after.pws.forEach((w) => console.log(`  pws ${w.product_id === TO ? 'WITH RACK' : 'PLAIN'} ${w.warehouse_id.slice(0, 8)} = ${w.stock_level}`));
console.log(`  plain still has ${after.orderItems.length} order lines (should be the ${keptItems.length} closed one(s))`);
