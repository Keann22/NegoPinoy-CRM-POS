import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const OUT = process.argv[2] || path.resolve(__dirname, 'procurement_physical_count.xlsx');

const ALL_OPEN_STATUSES = ['Pending Payment','Processing','Picked','Picked (with issue)','Photo','Packed','For Shipping','For Pick-up','On-Hold','Waiting for Stock'];
const UNFULFILLED_STATUSES = ['Processing','Picked (with issue)','Waiting for Stock'];
// Physically pulled off the rack and set aside for a customer, not yet shipped.
const RESERVED_STATUSES = ['Picked','Photo','Packed','For Shipping','For Pick-up'];

function pht(iso) { if (!iso) return ''; return new Date(new Date(iso).getTime() + 8*3600*1000).toISOString().slice(0,10); }

async function pageAll(table, select, filt) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(select).range(from, from + 999);
    q = filt(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
async function chunked(ids, build) {
  const out = [];
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build(chunk, from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
  }
  return out;
}

async function run() {
  // Candidate set (mirrors procurement route): staff drafts + pending purchases + negative stock
  const drafts = await pageAll('purchase_order_items', 'product_id, expected_qty, purchase_orders!inner(notes)',
    q => q.eq('purchase_orders.notes', 'STAFF_DRAFT').eq('status', 'pending_receipt'));
  const staffReq = new Map(); drafts.forEach(d => staffReq.set(d.product_id, (staffReq.get(d.product_id)||0) + d.expected_qty));

  const purchased = await pageAll('purchase_order_items', 'product_id, expected_qty, purchase_orders!inner(notes)',
    q => q.neq('purchase_orders.notes', 'STAFF_DRAFT').eq('status', 'pending_receipt'));
  const pending = new Map(); purchased.forEach(p => pending.set(p.product_id, (pending.get(p.product_id)||0) + p.expected_qty));

  const negRows = await pageAll('products', 'id', q => q.lt('stock_level', 0));
  const candidateIds = new Set([...staffReq.keys(), ...pending.keys(), ...negRows.map(r => r.id)]);

  // Bundle recipes consuming a candidate
  const allProducts = await pageAll('products', 'id, assembly_recipe', q => q);
  const bundleToComponents = new Map();
  for (const bp of allProducts) {
    const recipe = Array.isArray(bp.assembly_recipe) ? bp.assembly_recipe : [];
    if (!recipe.length) continue;
    const rel = recipe.map(c => ({ componentId: c.productId || c.component_id, qtyPerBundle: c.quantity || 1 }))
      .filter(c => c.componentId && candidateIds.has(c.componentId));
    if (rel.length) bundleToComponents.set(bp.id, rel);
  }
  const bundleName = new Map();
  const demandIds = Array.from(new Set([...candidateIds, ...bundleToComponents.keys()]));

  // Demand rows (open statuses) with order + customer context
  const demand = await chunked(demandIds, (chunk, a, b) =>
    supabase.from('order_items')
      .select('product_id, quantity, is_packed, orders!inner(id, status, payment_method, customer_id, shipping_name, order_date)')
      .in('product_id', chunk).in('orders.status', ALL_OPEN_STATUSES).range(a, b));

  const openIssues = await chunked(demandIds, (chunk, a, b) =>
    supabase.from('order_issues').select('order_id, product_id').eq('status', 'open').in('product_id', chunk).range(a, b));
  const openIssueKeys = new Set(openIssues.map(i => `${i.order_id}-${i.product_id}`));

  // product name lookup (for bundle labels)
  const nameRows = await chunked(demandIds, (chunk, a, b) =>
    supabase.from('products').select('id, name, variant_name').in('id', chunk).range(a, b));
  const nameOf = new Map(nameRows.map(p => [p.id, p.name + (p.variant_name ? ` [${p.variant_name}]` : '')]));

  const owedRaw = new Map();     // productId -> genuinely-owed units (unfulfilled)
  const reserved = new Map();    // productId -> [{orderShort, customerId, shippingName, qty, status, orderDate, payment, viaBundle}]
  const pushReserved = (pid, rec) => { const l = reserved.get(pid) || []; l.push(rec); reserved.set(pid, l); };

  for (const row of demand) {
    const o = row.orders;
    const isLayaway = o.payment_method === 'Lay-away';
    let unfulfilled = false;
    if (row.is_packed) unfulfilled = false;
    else if (o.status === 'Picked (with issue)') unfulfilled = openIssueKeys.has(`${o.id}-${row.product_id}`);
    else unfulfilled = UNFULFILLED_STATUSES.includes(o.status);

    // physically reserved (picked, not shipped)
    const pickedOk = row.is_packed || RESERVED_STATUSES.includes(o.status)
      || (o.status === 'Picked (with issue)' && !openIssueKeys.has(`${o.id}-${row.product_id}`));

    const apply = (pid, qty, via) => {
      if (!isLayaway && unfulfilled) owedRaw.set(pid, (owedRaw.get(pid)||0) + qty);
      if (pickedOk) pushReserved(pid, {
        orderShort: o.id.split('-')[0].toUpperCase(), customerId: o.customer_id,
        shippingName: o.shipping_name, qty, status: o.status, orderDate: o.order_date,
        payment: o.payment_method, viaBundle: via,
      });
    };

    if (candidateIds.has(row.product_id)) apply(row.product_id, row.quantity, null);
    bundleToComponents.get(row.product_id)?.forEach(c => apply(c.componentId, row.quantity * c.qtyPerBundle, nameOf.get(row.product_id) || 'bundle'));
  }

  // Buy list = genuine remaining need (raw owed minus pending POs) > 0, plus staff-drafted products
  const buyIds = new Set();
  for (const id of candidateIds) {
    const net = (owedRaw.get(id) || 0) - (pending.get(id) || 0);
    if (net > 0 || staffReq.has(id)) buyIds.add(id);
  }

  // Lookups for buy-list products
  const buyArr = Array.from(buyIds);
  const prodRows = await chunked(buyArr, (chunk, a, b) =>
    supabase.from('products').select('id, name, variant_name, stock_level, supplier_id').in('id', chunk).range(a, b));
  const suppliers = await pageAll('suppliers', 'id, name', q => q);
  const supName = new Map(suppliers.map(s => [s.id, s.name]));

  // customer names
  const custIds = Array.from(new Set(Array.from(buyIds).flatMap(id => (reserved.get(id)||[]).map(r => r.customerId).filter(Boolean))));
  const custRows = custIds.length ? await chunked(custIds, (chunk, a, b) =>
    supabase.from('customers').select('id, full_name').in('id', chunk).range(a, b)) : [];
  const custName = new Map(custRows.map(c => [c.id, c.full_name]));
  const nameForRec = r => custName.get(r.customerId) || r.shippingName || 'Unknown/Walk-in';

  // Build rows
  const rows = prodRows.map(p => {
    const label = p.name + (p.variant_name ? ` [${p.variant_name}]` : '');
    const res = reserved.get(p.id) || [];
    const resQty = res.reduce((s, r) => s + r.qty, 0);
    const net = Math.max(0, (owedRaw.get(p.id) || 0) - (pending.get(p.id) || 0));
    const summary = Object.entries(res.reduce((m, r) => { const n = nameForRec(r); m[n] = (m[n]||0) + r.qty; return m; }, {}))
      .map(([n, q]) => `${n} (${q})`).join(', ');
    return { id: p.id, supplier: supName.get(p.supplier_id) || '—', label, stock: p.stock_level,
      staffReq: staffReq.get(p.id) ?? '', needToBuy: net, resQty, summary, res };
  }).sort((a, b) => a.supplier.localeCompare(b.supplier) || a.label.localeCompare(b.label));

  // ---- Excel ----
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NegoPinoy'; wb.created = new Date();

  const ws = wb.addWorksheet('Count Sheet', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Supplier', key: 'supplier', width: 22 },
    { header: 'Product', key: 'product', width: 46 },
    { header: 'System Stock', key: 'stock', width: 13 },
    { header: 'Staff Req', key: 'staffReq', width: 10 },
    { header: 'Need to Buy', key: 'needToBuy', width: 12 },
    { header: 'Reserved (picked, not shipped)', key: 'resQty', width: 16 },
    { header: 'Rack Count (fill in)', key: 'rack', width: 16 },
    { header: 'True Physical (rack + reserved)', key: 'total', width: 18 },
    { header: 'Reserved For (customer × qty)', key: 'summary', width: 60 },
  ];
  rows.forEach((r, i) => {
    const excelRow = ws.addRow({ supplier: r.supplier, product: r.label, stock: r.stock, staffReq: r.staffReq,
      needToBuy: r.needToBuy, resQty: r.resQty, rack: '', total: '', summary: r.summary });
    const rn = i + 2;
    excelRow.getCell('total').value = { formula: `IF(G${rn}="","",G${rn}+F${rn})` };
    if (r.resQty > 0) excelRow.getCell('resQty').font = { bold: true, color: { argb: 'FFB45309' } };
    excelRow.getCell('rack').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7CC' } };
  });
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  ['stock','staffReq','needToBuy','resQty','rack','total'].forEach(k => { ws.getColumn(k).alignment = { horizontal: 'center' }; });

  const wd = wb.addWorksheet('Reserved Details', { views: [{ state: 'frozen', ySplit: 1 }] });
  wd.columns = [
    { header: 'Supplier', key: 'supplier', width: 22 },
    { header: 'Product', key: 'product', width: 46 },
    { header: 'Order #', key: 'order', width: 12 },
    { header: 'Customer', key: 'customer', width: 28 },
    { header: 'Qty', key: 'qty', width: 7 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Order Date (PHT)', key: 'date', width: 16 },
    { header: 'Payment', key: 'payment', width: 14 },
    { header: 'Note', key: 'note', width: 26 },
  ];
  for (const r of rows) {
    for (const a of r.res.sort((x, y) => new Date(x.orderDate) - new Date(y.orderDate))) {
      wd.addRow({ supplier: r.supplier, product: r.label, order: a.orderShort, customer: nameForRec(a),
        qty: a.qty, status: a.status, date: pht(a.orderDate), payment: a.payment,
        note: a.viaBundle ? `via bundle: ${a.viaBundle}` : '' });
    }
  }
  wd.getRow(1).font = { bold: true };
  wd.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

  await wb.xlsx.writeFile(OUT);

  const totalReserved = rows.reduce((s, r) => s + r.resQty, 0);
  console.log(`Products on buy list: ${rows.length}`);
  console.log(`  ...with reserved (picked, not shipped) units: ${rows.filter(r => r.resQty > 0).length}`);
  console.log(`Total reserved units to add to rack counts: ${totalReserved}`);
  console.log(`Wrote: ${OUT}`);
}
run().catch(e => { console.error(e); process.exit(1); });
