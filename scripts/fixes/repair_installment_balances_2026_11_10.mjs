/**
 * 2026-11-10: repair installment / lay-away orders after the Verify Shipping bug.
 *
 * Verify Shipping used to save the courier COD amount into orders.balance_due,
 * so balance_due stopped meaning "what the customer owes". An earlier repair only
 * fixed balances that had been set to 0. This one:
 *
 *  1. sets balance_due = max(0, total_amount - amount_paid) on open (not
 *     cancelled / returned) Installment and Lay-away orders where it differs;
 *  2. gives a next_due_date (delivery date + 1 month, like staff usually set it)
 *     to delivered orders that still owe at least ₱20 and have none, so they show
 *     on Collections Due Soon. Smaller leftovers are listed, not dated.
 *
 * Dry run by default. --apply writes, only where the row hasn't changed since read.
 * Backup of every touched row goes to scripts/scratch/ (git-ignored: customer data).
 *
 *   node scripts/fixes/repair_installment_balances_2026_11_10.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
const APPLY = process.argv.includes('--apply');
const MIN_DUE = 20;

const r2 = (n) => Math.round(n * 100) / 100;
const owes = (o) => Math.max(0, r2(Number(o.total_amount || 0) - Number(o.amount_paid || 0)));
const short = (id) => id.slice(0, 7).toUpperCase();
const plusOneMonth = (iso) => { const d = new Date(iso); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString(); };
const phDate = (iso) => new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' });

async function fetchAll() {
  let out = [];
  for (let off = 0; ; off += 1000) {
    const res = await fetch(`${URL_}/rest/v1/orders?select=id,status,payment_method,total_amount,amount_paid,balance_due,next_due_date,shipped_at,completed_at&payment_method=in.(Installment,Lay-away)&order=id&offset=${off}&limit=1000`, { headers: H });
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error(JSON.stringify(rows));
    out = out.concat(rows);
    if (rows.length < 1000) break;
  }
  return out;
}

const orders = (await fetchAll()).filter((o) => !/cancel|return/i.test(o.status));

const balanceFixes = orders
  .filter((o) => Math.abs(Number(o.balance_due || 0) - owes(o)) > 0.02)
  .map((o) => ({ o, newBalance: owes(o) }));

const delivered = ['Completed', 'Payment Received (COD)'];
const dueCandidates = orders.filter((o) => delivered.includes(o.status) && !o.next_due_date && owes(o) > 0.01);
const dueFixes = [];
const dueSkipped = [];
for (const o of dueCandidates) {
  const ref = o.completed_at || o.shipped_at;
  if (owes(o) < MIN_DUE) dueSkipped.push({ o, why: `only ₱${owes(o)} left (rounding?)` });
  else if (!ref) dueSkipped.push({ o, why: 'no delivery date' });
  else dueFixes.push({ o, due: plusOneMonth(ref) });
}

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}  ${new Date().toISOString()}\n`);
console.log(`1. Balance fixes: ${balanceFixes.length}`);
for (const { o, newBalance } of balanceFixes) {
  console.log(`   #${short(o.id)}  ${o.payment_method.padEnd(11)} ${o.status.padEnd(22)} total ${o.total_amount}  paid ${r2(Number(o.amount_paid || 0))}  balance ${r2(Number(o.balance_due || 0))} -> ${newBalance}`);
}
console.log(`\n2. Due dates to set: ${dueFixes.length}`);
for (const { o, due } of dueFixes) {
  console.log(`   #${short(o.id)}  owes ${owes(o)}  delivered ${phDate(o.completed_at || o.shipped_at)}  due ${phDate(due)}`);
}
console.log(`\n   Not dated: ${dueSkipped.length}`);
for (const { o, why } of dueSkipped) console.log(`   #${short(o.id)}  ${why}`);

const scratch = path.join(ROOT, 'scripts', 'scratch');
fs.mkdirSync(scratch, { recursive: true });
const backupFile = path.join(scratch, `repair_installment_balances_${APPLY ? 'apply' : 'dryrun'}_${Date.now()}.json`);
fs.writeFileSync(backupFile, JSON.stringify({ balanceFixes, dueFixes, dueSkipped }, null, 1));
console.log(`\nBackup: ${backupFile}`);

if (!APPLY) { console.log('\nDry run only. Re-run with --apply to write.'); process.exit(0); }

let ok = 0, changed = 0, failed = 0;
async function patch(filter, body) {
  const res = await fetch(`${URL_}/rest/v1/orders?${filter}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) });
  if (!res.ok) { failed++; console.log('   error', res.status, await res.text()); return; }
  const rows = await res.json();
  if (rows.length === 1) ok++; else { changed++; console.log('   skipped (changed since read):', filter.slice(0, 50)); }
}
for (const { o, newBalance } of balanceFixes) {
  // Only if money hasn't moved since we read it.
  await patch(`id=eq.${o.id}&amount_paid=eq.${o.amount_paid}&total_amount=eq.${o.total_amount}`, { balance_due: newBalance });
}
for (const { o, due } of dueFixes) {
  await patch(`id=eq.${o.id}&next_due_date=is.null`, { next_due_date: due });
}
console.log(`\nWritten: ${ok}, skipped because changed: ${changed}, errors: ${failed}`);
