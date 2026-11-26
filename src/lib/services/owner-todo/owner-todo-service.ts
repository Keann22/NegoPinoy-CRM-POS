import type { SupabaseClient } from '@supabase/supabase-js';
import { listCustomerReturns } from '@/lib/services/customer-returns/customer-return-service';
import { listSupplierReturns } from '@/lib/services/supplier-return-service';
import { PAYMENT_REVIEW_START_UTC } from '@/lib/services/payments/payment-review-cutoff';
import type { FlaggedPayment, OwnerTodoItem, OwnerTodoResponse, OwnerUploadKind } from '@/types/owner-todo.types';

/**
 * Owner to-do (owner, 2026-11-25): what only the owners can do, worked out from
 * live data each time, so a row clears by itself once the work is done. The
 * owners don't read the bell (500+ unread in 30 days), so this is the list.
 * Server only (service role).
 */

const DAY_MS = 86400000;
/** Uploads older than this turn the row red. */
const UPLOAD_OVERDUE_DAYS = 7;
/** Methods that aren't money the customer sent us directly. */
const NOT_MANUAL = '("SPX COD Remittance","Store Credit")';
const REF_REUSED_MARK = '[GCash reference already used';
const RECEIVER_MARK = '[Not sent to our GCash';

const peso = (n: number) => `₱${Math.round(n || 0).toLocaleString('en-PH')}`;
const phDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });
const daysSince = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY_MS));
const ago = (days: number) => (days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-PH')} ${n === 1 ? one : many}`;

/** All rows of a query, past the 1,000-row cap. */
async function allRows<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

async function lastUpload(supabase: SupabaseClient, kind: OwnerUploadKind) {
  const { data } = await supabase
    .from('owner_uploads')
    .select('uploaded_at, uploaded_by_name, matched')
    .eq('kind', kind)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { uploaded_at: string; uploaded_by_name: string | null; matched: number | null } | null;
}

/** Saves an upload (GCash statement or SPX file) so the to-do knows when it was last done. */
export async function recordOwnerUpload(
  supabase: SupabaseClient,
  input: { kind: OwnerUploadKind; byName: string; matched?: number | null; fileName?: string | null },
) {
  const { error } = await supabase.from('owner_uploads').insert({
    kind: input.kind,
    uploaded_by_name: input.byName,
    matched: input.matched ?? null,
    file_name: input.fileName ? String(input.fileName).slice(0, 200) : null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/**
 * Upload the GCash statement (Payments → Verify): it checks every pending payment
 * whose reference is on the statement. Counts what came in since the last upload.
 * Uploads weren't saved before 2026-11-25; until the first saved one, "last upload"
 * is worked out from the newest payment a statement verified.
 */
async function gcashRow(supabase: SupabaseClient, now: number): Promise<OwnerTodoItem | null> {
  const logged = await lastUpload(supabase, 'gcash_statement');
  let since = logged?.uploaded_at || null;
  if (!since) {
    const { data } = await supabase
      .from('payments')
      .select('created_at')
      .eq('status', 'Verified')
      .not('reference_number', 'is', null)
      .not('payment_method', 'in', NOT_MANUAL)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    since = (data as { created_at: string } | null)?.created_at || null;
  }
  const pending = await allRows<{ amount: number; created_at: string }>((a, b) => {
    let q = supabase
      .from('payments')
      .select('amount, created_at')
      .eq('status', 'Pending')
      .gte('payment_date', PAYMENT_REVIEW_START_UTC)
      .not('reference_number', 'is', null)
      .not('payment_method', 'in', NOT_MANUAL);
    if (since) q = q.gt('created_at', since);
    return q.range(a, b);
  });
  const { count: older } = since
    ? await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'Pending')
      .gte('payment_date', PAYMENT_REVIEW_START_UTC)
      .not('reference_number', 'is', null)
      .not('payment_method', 'in', NOT_MANUAL)
      .lte('created_at', since)
    : { count: 0 };

  const days = since ? daysSince(since, now) : null;
  const overdue = days === null || days >= UPLOAD_OVERDUE_DAYS;
  if (pending.length === 0 && !overdue) return null;
  const amount = pending.reduce((s, p) => s + Number(p.amount || 0), 0);
  const last = logged
    ? `Last upload: ${phDate(logged.uploaded_at)} (${ago(days!)})${logged.uploaded_by_name ? ` by ${logged.uploaded_by_name}` : ''}.`
    : since
      ? `Last upload wasn't saved; it checked payments up to ${phDate(since)} (${ago(days!)}).`
      : 'No upload saved yet.';
  const waiting = pending.length
    ? ` ${plural(pending.length, 'payment')} (${peso(amount)}) came in since then.`
    : '';
  const olderText = older ? ` ${plural(older, 'older payment')} still not on any statement.` : '';
  return {
    key: 'gcash_statement',
    title: 'Upload the GCash statement',
    detail: `${last}${waiting}${olderText}`,
    count: pending.length,
    amount,
    level: overdue ? 'red' : 'amber',
    href: '/dashboard/accounting/payments',
    actionLabel: 'Open Payments',
  };
}

/** Payments the app flagged: GCash not sent to our numbers, or a reference used twice. */
async function flaggedRow(supabase: SupabaseClient): Promise<OwnerTodoItem | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, order_id, amount, payment_method, created_at, notes')
    .eq('status', 'Pending')
    .gte('payment_date', PAYMENT_REVIEW_START_UTC)
    .or(`notes.ilike.%${RECEIVER_MARK}%,notes.ilike.%${REF_REUSED_MARK}%`)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = (data || []) as { id: string; order_id: string | null; amount: number; payment_method: string; created_at: string; notes: string | null }[];
  if (rows.length === 0) return null;
  const flagged: FlaggedPayment[] = rows.map((r) => {
    const notes = r.notes || '';
    const mark = notes.includes(REF_REUSED_MARK) ? REF_REUSED_MARK : RECEIVER_MARK;
    const start = notes.indexOf(mark);
    const end = notes.indexOf(']', start);
    const reason = notes.slice(start + 1, end > start ? end : undefined).trim();
    return { id: r.id, orderId: r.order_id, amount: Number(r.amount) || 0, method: r.payment_method, createdAt: r.created_at, reason };
  });
  const reused = flagged.filter((f) => f.reason.startsWith('GCash reference')).length;
  const notOurs = flagged.length - reused;
  return {
    key: 'flagged_payments',
    title: 'Check flagged payments',
    detail: [notOurs ? `${plural(notOurs, 'payment')} not sent to our GCash (or receiver not shown)` : '', reused ? `${reused} with a reference used twice` : '']
      .filter(Boolean).join(', ') + '. Open the order, look at the screenshot, then verify or fix it.',
    count: flagged.length,
    amount: flagged.reduce((s, f) => s + f.amount, 0),
    level: 'amber',
    href: '/dashboard/accounting/payments',
    actionLabel: 'Open Payments',
    flagged,
  };
}

/**
 * Upload the SPX remittance file: it records the COD money SPX paid us and marks
 * those orders paid. Counts COD orders the courier delivered (last 90 days) that
 * still show a balance.
 */
async function spxRow(supabase: SupabaseClient, now: number): Promise<OwnerTodoItem | null> {
  const [logged, { data: lastPay }] = await Promise.all([
    lastUpload(supabase, 'spx_remittance'),
    supabase
      .from('payments')
      .select('created_at')
      .eq('payment_method', 'SPX COD Remittance')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const payAt = (lastPay as { created_at: string } | null)?.created_at || null;
  const last = [logged?.uploaded_at, payAt].filter(Boolean).sort().pop() || null;

  const since90 = new Date(now - 90 * DAY_MS).toISOString();
  const owing = await allRows<{ balance_due: number; tracking_number: string | null }>((a, b) => supabase
    .from('orders')
    .select('balance_due, tracking_number')
    .eq('status', 'Completed')
    .eq('payment_method', 'COD')
    .gt('balance_due', 0)
    .gte('shipped_at', since90)
    .range(a, b));
  const delivered = owing.filter((o) => !/^BUS/i.test(o.tracking_number || ''));

  const days = last ? daysSince(last, now) : null;
  const overdue = days === null || days >= UPLOAD_OVERDUE_DAYS;
  if (delivered.length === 0 && !overdue) return null;
  const amount = delivered.reduce((s, o) => s + Number(o.balance_due || 0), 0);
  const lastText = last
    ? `Last upload: ${phDate(last)} (${ago(days!)})${logged && logged.uploaded_at === last && logged.uploaded_by_name ? ` by ${logged.uploaded_by_name}` : ''}.`
    : 'No upload saved yet.';
  return {
    key: 'spx_remittance',
    title: 'Upload the SPX remittance file',
    detail: `${lastText}${delivered.length ? ` ${plural(delivered.length, 'COD order')} delivered but still owing ${peso(amount)}.` : ''}`,
    count: delivered.length,
    amount,
    level: overdue ? 'red' : 'amber',
    href: '/dashboard/accounting/remittances',
    actionLabel: 'Open SPX Remittances',
  };
}

/** Payment Fix rows (GCash mismatches) not reconciled yet. */
async function paymentFixRow(supabase: SupabaseClient): Promise<OwnerTodoItem | null> {
  const rows = await allRows<{ payment_id: string }>((a, b) => supabase.from('payment_discrepancies').select('payment_id').range(a, b));
  if (rows.length === 0) return null;
  const ids = rows.map((r) => r.payment_id);
  let reconciled = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { count } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .in('id', ids.slice(i, i + 200))
      .ilike('notes', '%[Reconciled%');
    reconciled += count || 0;
  }
  const open = ids.length - reconciled;
  if (open <= 0) return null;
  return {
    key: 'payment_fix',
    title: 'Finish Payment Fix',
    detail: `${plural(open, 'GCash mismatch', 'GCash mismatches')} of ${ids.length} not fixed yet.`,
    count: open,
    amount: null,
    level: 'plain',
    href: '/dashboard/payment-discrepancies',
    actionLabel: 'Open Payment Fix',
  };
}

/** Customer returns waiting for the owners' decision (damaged, customer-sent, or sales didn't answer in 3 days). */
async function returnsRow(supabase: SupabaseClient, now: number): Promise<OwnerTodoItem | null> {
  const { returns } = await listCustomerReturns(supabase, true);
  const waiting = returns.filter((r) => r.stage === 'needs_owner');
  if (waiting.length === 0) return null;
  const oldest = Math.max(...waiting.map((r) => daysSince(r.createdAt, now)));
  return {
    key: 'returns_decide',
    title: 'Decide on returns',
    detail: `${plural(waiting.length, 'return')} waiting for you: replacement, refund, or what to do with damaged pieces (oldest ${ago(oldest)}).`,
    count: waiting.length,
    amount: null,
    level: oldest >= 3 ? 'red' : 'amber',
    href: '/dashboard/inventory/returns',
    actionLabel: 'Open Returns',
  };
}

/** Bad items to take back to the supplier, and suppliers late with a replacement. */
async function supplierReturnsRow(supabase: SupabaseClient): Promise<OwnerTodoItem | null> {
  const { returns } = await listSupplierReturns(supabase, true);
  const toReturn = returns.filter((r) => r.status === 'to_return');
  const late = returns.filter((r) => r.isOverdue);
  if (toReturn.length === 0 && late.length === 0) return null;
  const pieces = toReturn.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  return {
    key: 'supplier_returns',
    title: 'Supplier returns',
    detail: [
      toReturn.length ? `${plural(pieces, 'piece')} to bring back on your next buying trip` : '',
      late.length ? `${plural(late.length, 'supplier')} late with a replacement` : '',
    ].filter(Boolean).join('; ') + '.',
    count: toReturn.length + late.length,
    amount: null,
    level: late.length ? 'amber' : 'plain',
    href: '/dashboard/inventory/supplier-returns',
    actionLabel: 'Open Supplier Returns',
  };
}

/** Staff waiting on the owners: a reply they haven't read, or a task with a problem. */
async function staffWaitingRow(supabase: SupabaseClient): Promise<OwnerTodoItem | null> {
  const { data, error } = await supabase
    .from('staff_tasks')
    .select('status, progress, kind, last_message_at, last_message_from_owner, owner_read_at')
    .is('cancelled_at', null)
    .or('progress.eq.problem,last_message_at.not.is.null')
    .or('kind.is.null,kind.neq.note')
    .limit(500);
  if (error) throw error;
  const rows = (data || []) as { status: string; progress: string | null; last_message_at: string | null; last_message_from_owner: boolean | null; owner_read_at: string | null }[];
  const problems = rows.filter((r) => r.status === 'open' && r.progress === 'problem').length;
  const replies = rows.filter((r) => r.last_message_at && r.last_message_from_owner === false
    && (!r.owner_read_at || r.owner_read_at < r.last_message_at)).length;
  if (problems + replies === 0) return null;
  return {
    key: 'staff_waiting',
    title: 'Staff are waiting on you',
    detail: [problems ? `${plural(problems, 'task')} with a problem` : '', replies ? `${plural(replies, 'reply', 'replies')} not read yet` : '']
      .filter(Boolean).join(', ') + '.',
    count: problems + replies,
    amount: null,
    level: problems ? 'red' : 'amber',
    href: '/dashboard/tasks',
    actionLabel: 'Open Tasks',
  };
}

/** Purchases received in the last 30 days with no cost entered. */
async function costsRow(supabase: SupabaseClient, now: number): Promise<OwnerTodoItem | null> {
  const since = new Date(now - 30 * DAY_MS).toISOString();
  const { count, error } = await supabase
    .from('inventory_movements')
    .select('id', { count: 'exact', head: true })
    .eq('unit_cost', 0)
    .ilike('movement_type', 'restock')
    .gte('timestamp', since);
  if (error) throw error;
  if (!count) return null;
  return {
    key: 'costs',
    title: 'Enter costs',
    detail: `${plural(count, 'delivery', 'deliveries')} received in the last 30 days with no cost, so profit is off.`,
    count,
    amount: null,
    level: 'plain',
    href: '/dashboard/inventory/pending-costs',
    actionLabel: 'Open Encode Costs',
  };
}

/** Shipped orders still owing that SPX won't pay us for (bus, or no tracking number). */
async function unpaidOtherRow(supabase: SupabaseClient): Promise<OwnerTodoItem | null> {
  const rows = await allRows<{ balance_due: number; tracking_number: string | null }>((a, b) => supabase
    .from('orders')
    .select('balance_due, tracking_number')
    .in('status', ['Shipped', 'Completed'])
    .gt('balance_due', 0)
    .or('tracking_number.is.null,tracking_number.eq.,tracking_number.ilike.BUS%')
    .range(a, b));
  if (rows.length === 0) return null;
  const amount = rows.reduce((s, r) => s + Number(r.balance_due || 0), 0);
  return {
    key: 'unpaid_other',
    title: 'Collect from shipped orders (bus / no tracking)',
    detail: `${plural(rows.length, 'order')} shipped without SPX still owe ${peso(amount)}.`,
    count: rows.length,
    amount,
    level: 'plain',
    href: '/dashboard/accounting/unpaid-shipped',
    actionLabel: 'Open Unpaid Shipped',
  };
}

const ORDER: Record<OwnerTodoItem['level'], number> = { red: 0, amber: 1, plain: 2 };

export async function getOwnerTodo(supabase: SupabaseClient): Promise<OwnerTodoResponse> {
  const now = Date.now();
  const rows = await Promise.all([
    gcashRow(supabase, now),
    flaggedRow(supabase),
    spxRow(supabase, now),
    returnsRow(supabase, now),
    staffWaitingRow(supabase),
    supplierReturnsRow(supabase),
    paymentFixRow(supabase),
    costsRow(supabase, now),
    unpaidOtherRow(supabase),
  ].map((p) => p.catch((e) => {
    console.error('owner-todo row failed:', e);
    return null;
  })));
  const items = rows.filter((r): r is OwnerTodoItem => !!r);
  // Stable sort: red first, then amber, then the rest, keeping the order above.
  items.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  return { items, checkedAt: new Date(now).toISOString() };
}
