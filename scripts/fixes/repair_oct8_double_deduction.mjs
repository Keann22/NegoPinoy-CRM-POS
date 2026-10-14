// One-off repair for the 2026-10-08 → 2026-10-14 "deduct at pick" regression.
//
// Commit 0144a8b moved stock deduction to pick/pack, but process_order_transaction
// kept deducting at order creation. It was reverted on 2026-10-14 (deduct at
// creation only; cancel restores). Under that rule, the ledger events of the bug
// window are corrected per product:
//
//   "Order Allocated (<status>)"            → should not exist          → add back
//   "Order De-allocated (<not Cancelled>)"  → should not exist          → take back out
//   "Order De-allocated (Cancelled)"        → acts as the cancel refund → keep
//   "Restored Physical Shelf Count … reversing old processing deduction"
//        (Oct 8 01:03 PHT migration that switched 130 products to the
//         deduct-at-pick rule by dropping open-order reservations) → undo
//   Cancelled order still holding its creation deduction → add back
//
// Any event at or before the product's latest real shelf count is skipped: a count
// (Guardian audit = physical − unpicked reservations, Procurement Edit, Manual
// Stock Adjustment) re-anchors stock_level, so earlier errors no longer exist.
//
//   node scripts/fixes/repair_oct8_double_deduction.mjs          → preview CSV only
//   node scripts/fixes/repair_oct8_double_deduction.mjs --apply  → write to the DB

import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const APPLY = process.argv.includes('--apply');
const REPAIR_TAG = 'Oct 8 double-deduction repair';
const SCOPE_START = '2026-08-01T00:00:00Z'; // cancelled orders + shelf counts are checked from here

async function getAll(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    const j = await r.json();
    if (!Array.isArray(j)) throw new Error(`${path}: ${JSON.stringify(j)}`);
    out.push(...j);
    if (j.length < 1000) break;
  }
  return out;
}

const isAllocated = (r) => /^Order Allocated \(/.test(r || '');
const isDeallocCancel = (r) => /^Order De-allocated \(Cancelled\)/.test(r || '');
const isDeallocOther = (r) => /^Order De-allocated \(/.test(r || '') && !isDeallocCancel(r);
const isMigration = (r) => /^Restored Physical Shelf Count .*reversing old processing deduction/.test(r || '');
const isShelfCount = (r) =>
  /Physical shelf count set|Physical Count Correction|Procurement Edit \(|Manual Stock Adjustment|Manual Physical Stock Update/.test(r || '');

async function main() {
  const already = await getAll(`inventory_movements?select=id&reason=like.${encodeURIComponent(`${REPAIR_TAG}*`)}&limit=1`);
  if (already.length > 0) throw new Error('Repair movements already exist — refusing to run twice.');

  const recent = await getAll(`inventory_movements?select=product_id,quantity_change,reason,timestamp&timestamp=gte.${SCOPE_START}&order=timestamp`);
  const audits = await getAll(`inventory_guardian_memory?select=product_id,created_at&action_type=eq.physical_count_audit&created_at=gte.${SCOPE_START}`);

  const lastCount = new Map();
  const bumpCount = (pid, ts) => { if (!lastCount.has(pid) || new Date(ts) > new Date(lastCount.get(pid))) lastCount.set(pid, ts); };
  recent.filter((m) => isShelfCount(m.reason)).forEach((m) => bumpCount(m.product_id, m.timestamp));
  audits.forEach((a) => bumpCount(a.product_id, a.created_at));
  const absorbed = (pid, ts) => lastCount.has(pid) && new Date(lastCount.get(pid)) >= new Date(ts);

  const rows = new Map();
  const row = (pid) => {
    if (!rows.has(pid)) rows.set(pid, { picks: 0, reverts: 0, migration: 0, cancels: 0, skipped: 0, orders: new Set() });
    return rows.get(pid);
  };
  // Duplicate sale SKUs merged on 2026-10-12 moved their whole stock_level (errors
  // included) onto the keeper SKU, so corrections for events before the merge
  // belong on the keeper.
  const merges = new Map(); // deleted product_id → { keeperId, ts }
  const mergeRows = await getAll(`inventory_movements?select=product_id,reason,timestamp&reason=like.${encodeURIComponent('Stock transferred to keeper*')}`);
  for (const m of mergeRows) {
    const sku = (m.reason.match(/SKU (\S+)/) || [])[1];
    const keeper = sku && (await getAll(`products?select=id&sku=eq.${encodeURIComponent(sku)}`))[0];
    if (keeper) merges.set(m.product_id, { keeperId: keeper.id, ts: m.timestamp });
  }

  const add = (pid, ts, field, qty, orderTag) => {
    if (absorbed(pid, ts)) { row(pid).skipped += qty; return; }
    const merge = merges.get(pid);
    if (merge && new Date(ts) < new Date(merge.ts)) pid = merge.keeperId;
    const r = row(pid);
    if (absorbed(pid, ts)) { r.skipped += qty; return; }
    r[field] += qty;
    if (orderTag) r.orders.add(orderTag);
  };
  const shortId = (reason) => ((reason.match(/#([0-9a-f]{8})/) || [])[1]);

  for (const m of recent) {
    if (isAllocated(m.reason)) add(m.product_id, m.timestamp, 'picks', -m.quantity_change, shortId(m.reason));
    else if (isDeallocOther(m.reason)) add(m.product_id, m.timestamp, 'reverts', -m.quantity_change, shortId(m.reason));
    else if (isMigration(m.reason)) add(m.product_id, m.timestamp, 'migration', -m.quantity_change, null);
  }

  // Cancelled orders whose stock was never given back. Allocated / non-cancel
  // De-allocated rows are excluded here because they are reversed above.
  // order_logs has no cancel entry, so absorption is judged from the order's
  // latest movement for that product (conservative: skip if counted after it).
  const cancelled = await getAll(`orders?select=id&status=eq.Cancelled&order_date=gte.${SCOPE_START}`);
  for (let i = 0; i < cancelled.length; i += 40) {
    const ids = cancelled.slice(i, i + 40).map((o) => o.id);
    const mv = await getAll(`inventory_movements?select=product_id,quantity_change,reason,timestamp&or=(${ids.map((id) => `reason.like.*${id}*`).join(',')})`);
    for (const id of ids) {
      const net = new Map();
      const lastTs = new Map();
      for (const m of mv.filter((x) => x.reason.includes(id) && !isAllocated(x.reason) && !isDeallocOther(x.reason))) {
        net.set(m.product_id, (net.get(m.product_id) || 0) + m.quantity_change);
        if (!lastTs.has(m.product_id) || m.timestamp > lastTs.get(m.product_id)) lastTs.set(m.product_id, m.timestamp);
      }
      for (const [pid, n] of net) if (n < 0) add(pid, lastTs.get(pid), 'cancels', -n, `${id.slice(0, 8)}(cancelled)`);
    }
  }

  const pids = [...rows.keys()];
  const products = new Map();
  for (let i = 0; i < pids.length; i += 100) {
    const p = await getAll(`products?select=id,name,sku,stock_level&id=in.(${pids.slice(i, i + 100).join(',')})`);
    p.forEach((x) => products.set(x.id, x));
  }

  const plan = pids
    .map((pid) => {
      const r = rows.get(pid);
      return { pid, p: products.get(pid), ...r, addBack: r.picks + r.reverts + r.migration + r.cancels };
    })
    .filter((x) => x.p && (x.addBack !== 0 || x.skipped !== 0))
    .sort((a, b) => b.addBack - a.addBack || a.p.name.localeCompare(b.p.name));

  const csvEsc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const pht = (ts) => (ts ? new Date(new Date(ts).getTime() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : '');
  const header = ['Product', 'SKU', 'Current stock', 'Total change', 'New stock', 'Duplicate pick/pack deductions', 'Reverted-to-Processing refunds', 'Undo Oct 8 migration', 'Cancelled orders', 'Skipped (already fixed by a later shelf count)', 'Last shelf count (PHT)', 'Orders'];
  const lines = [header.map(csvEsc).join(',')];
  for (const x of plan) {
    lines.push([
      x.p.name, x.p.sku, x.p.stock_level, x.addBack, x.p.stock_level + x.addBack,
      x.picks, x.reverts, x.migration, x.cancels, x.skipped, pht(lastCount.get(x.pid)), [...x.orders].join(' '),
    ].map(csvEsc).join(','));
  }
  const out = 'scripts/reports/oct8_double_deduction_repair_preview.csv';
  fs.writeFileSync(out, lines.join('\n'));

  const toFix = plan.filter((x) => x.addBack !== 0);
  const sum = (k) => toFix.reduce((s, x) => s + x[k], 0);
  console.log(`Products to change: ${toFix.length} (${toFix.filter((x) => x.addBack > 0).length} up, ${toFix.filter((x) => x.addBack < 0).length} down)`);
  console.log(`Net units: ${sum('addBack')} = picks ${sum('picks')} + reverts ${sum('reverts')} + migration undo ${sum('migration')} + cancelled ${sum('cancels')}`);
  console.log(`Skipped (already fixed by a later shelf count): ${plan.reduce((s, x) => s + x.skipped, 0)} units`);
  console.log(`Negative before: ${toFix.filter((x) => x.p.stock_level < 0).length}, after: ${toFix.filter((x) => x.p.stock_level + x.addBack < 0).length}`);
  console.log(`Preview written to ${out}`);

  if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply to write.'); return; }

  for (const x of toFix) {
    const rpc = await fetch(`${URL}/rest/v1/rpc/increment_stock`, {
      method: 'POST', headers: H, body: JSON.stringify({ p_product_id: x.pid, qty: x.addBack, new_unit_cost: null }),
    });
    if (!rpc.ok) throw new Error(`increment_stock failed for ${x.p.name}: ${await rpc.text()}`);
    const parts = [];
    if (x.picks) parts.push(`${x.picks} duplicate pick/pack`);
    if (x.reverts) parts.push(`${x.reverts} revert-to-Processing`);
    if (x.migration) parts.push(`${x.migration} Oct 8 migration undo`);
    if (x.cancels) parts.push(`${x.cancels} cancelled-order`);
    const ins = await fetch(`${URL}/rest/v1/inventory_movements`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        product_id: x.pid, quantity_change: x.addBack, movement_type: 'adjustment',
        reason: `${REPAIR_TAG}: ${parts.join(', ')} by System`,
      }),
    });
    if (!ins.ok) throw new Error(`movement insert failed for ${x.p.name}: ${await ins.text()}`);
  }
  console.log(`\nApplied to ${toFix.length} products.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
