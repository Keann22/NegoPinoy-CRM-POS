// One-time restore for staff requests erased by partial purchases (fixed in
// splitStaffDraftLine). Buying fewer units than requested used to move the whole
// STAFF_DRAFT line - with every order source behind it - onto the purchase PO.
// This moves back the sources whose orders are still Picked (with issue) with an
// open issue for the product (i.e. still missing) and aren't already on the
// current draft, raising that product's Staff Req. to match.
//
//   node scripts/fixes/restore_dropped_staff_requests.mjs          # dry run
//   APPLY=1 node scripts/fixes/restore_dropped_staff_requests.mjs  # write
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
process.env.BACKUP ||= `restore-staff-requests-backup-${Date.now()}.json`;
const APPLY = process.env.APPLY === '1';
let src = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('procurement_request_sources')
    .select('id, quantity, order_id, created_at, purchase_order_item_id, purchase_order_items!inner(id, po_id, product_id, expected_qty, purchase_orders!inner(notes)), orders(status)')
    .order('id').range(from, from + 999);
  if (error) throw error;
  src = src.concat(data); if (data.length < 1000) break;
}
const byItem = new Map();
for (const s of src) { const k=s.purchase_order_item_id; if(!byItem.has(k)) byItem.set(k,{item:s.purchase_order_items, srcs:[]}); byItem.get(k).srcs.push(s); }
const victims = [...byItem.values()].filter(({item,srcs}) => item.purchase_orders.notes !== 'STAFF_DRAFT' && srcs.reduce((a,s)=>a+s.quantity,0) > item.expected_qty);
const cand = victims.flatMap(v => v.srcs.filter(s => s.orders?.status === 'Picked (with issue)'));
const pids = [...new Set(cand.map(s=>s.purchase_order_items.product_id))];
const oids = [...new Set(cand.map(s=>s.order_id))];
const { data: issues } = await sb.from('order_issues').select('order_id, product_id').eq('status','open').in('order_id', oids);
const { data: ois } = await sb.from('order_items').select('order_id, product_id, quantity').in('order_id', oids);
const { data: prods } = await sb.from('products').select('id, name, assembly_recipe').in('id', [...new Set([...pids, ...ois.map(o=>o.product_id)])]);
const pmap = new Map(prods.map(p=>[p.id,p]));
const compsOf = id => new Set((pmap.get(id)?.assembly_recipe||[]).map(c=>c.productId||c.component_id).filter(Boolean));
// current draft lines + their sourced orders
const { data: drafts } = await sb.from('purchase_order_items').select('id, po_id, product_id, expected_qty, purchase_orders!inner(notes)').eq('purchase_orders.notes','STAFF_DRAFT').eq('status','pending_receipt');
const draftByPid = new Map(drafts.map(d=>[d.product_id,d]));
const onDraft = new Set(src.filter(s=>s.purchase_order_items.purchase_orders.notes==='STAFF_DRAFT').map(s=>s.purchase_order_items.product_id+'|'+s.order_id));
const plan = new Map(); const seen = new Set();
for (const s of cand.sort((a,b)=>b.created_at.localeCompare(a.created_at))) {
  const pid = s.purchase_order_items.product_id, key = pid+'|'+s.order_id;
  if (seen.has(key) || onDraft.has(key)) continue;
  const oi = ois.find(o => o.order_id===s.order_id && (o.product_id===pid || compsOf(o.product_id).has(pid)));
  if (!oi) continue;
  const hasIssue = issues.some(i => i.order_id===s.order_id && (i.product_id===pid || i.product_id===oi.product_id));
  if (!hasIssue) continue;
  seen.add(key);
  s.quantity = Math.min(s.quantity, oi.quantity * (oi.product_id===pid ? 1 : ((pmap.get(oi.product_id)?.assembly_recipe||[]).find(c=>(c.productId||c.component_id)===pid)?.quantity||1)));
  s.capped = true;
  if (!plan.has(pid)) plan.set(pid, []);
  plan.get(pid).push(s);
}
let total=0;
for (const [pid, list] of plan) {
  const d = draftByPid.get(pid); const add = list.reduce((a,s)=>a+s.quantity,0); total+=add;
  console.log(`${pmap.get(pid)?.name}: Staff Req ${d?.expected_qty||0} -> ${(d?.expected_qty||0)+add}  (+${add}: ${list.map(s=>s.order_id.slice(0,8).toUpperCase()).join(', ')})`);
}
console.log('products', plan.size, 'units restored', total, APPLY?'APPLYING':'(dry run)');
if (!APPLY) process.exit(0);
const backup = { drafts, plan: [...plan].map(([pid,l])=>({pid, srcs:l.map(s=>({id:s.id, from:s.purchase_order_item_id, qty:s.quantity, origQty: src.find(x=>x.id===s.id)?.quantity}))})) , created: [] };
let draftPo = drafts[0]?.po_id;
if (!draftPo) { const { data: po } = await sb.from('purchase_orders').select('id').eq('notes','STAFF_DRAFT').limit(1).maybeSingle(); draftPo = po?.id; }
if (!draftPo) { const { data: po, error } = await sb.from('purchase_orders').insert({status:'pending_receipt', notes:'STAFF_DRAFT'}).select('id').single(); if (error) throw error; draftPo = po.id; backup.created.push({po:po.id}); }
for (const [pid, list] of plan) {
  const add = list.reduce((a,s)=>a+s.quantity,0);
  let d = draftByPid.get(pid);
  if (d) {
    const { error } = await sb.from('purchase_order_items').update({ expected_qty: d.expected_qty + add }).eq('id', d.id); if (error) throw error;
  } else {
    const { data: ins, error } = await sb.from('purchase_order_items').insert({ po_id: draftPo, product_id: pid, expected_qty: add, unit_cost: 0, status: 'pending_receipt' }).select('id').single(); if (error) throw error;
    d = { id: ins.id }; backup.created.push({item: ins.id});
  }
  for (const s of list) { const { error: mvErr } = await sb.from('procurement_request_sources').update({ purchase_order_item_id: d.id, quantity: s.quantity }).eq('id', s.id); if (mvErr) throw mvErr; }
}
fs.writeFileSync(process.env.BACKUP, JSON.stringify(backup, null, 1));
console.log('done; backup at', process.env.BACKUP);
