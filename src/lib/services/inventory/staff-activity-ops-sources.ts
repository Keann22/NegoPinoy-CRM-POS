import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffActivityBadge, StaffActivityItem } from '@/types';
import {
  isSystemActor,
  sanitizeReason,
  type ActivityDirectory,
  type ActivityTarget,
} from './staff-activity-people';
import {
  formatProductName,
  one,
  shortOrder,
  type ActivityWindow,
} from './staff-activity-order-sources';

interface CustomerReturnEventRow {
  id: string;
  return_id: string;
  event: string;
  note: string | null;
  actor_name: string | null;
  created_at: string;
  customer_returns?:
    | { case_no?: number | null; order_id?: string | null }
    | { case_no?: number | null; order_id?: string | null }[]
    | null;
}

interface SupplierReturnEventRow {
  id: string;
  return_id: string;
  event: string;
  qty: number | null;
  note: string | null;
  actor_name: string | null;
  created_at: string;
  supplier_returns?:
    | {
        return_no?: string | null;
        products?:
          | { name?: string | null; variant_name?: string | null }
          | { name?: string | null; variant_name?: string | null }[]
          | null;
      }
    | {
        return_no?: string | null;
        products?:
          | { name?: string | null; variant_name?: string | null }
          | { name?: string | null; variant_name?: string | null }[]
          | null;
      }[]
    | null;
}

interface TaskDoneRow {
  id: string;
  message: string;
  order_id: string | null;
  kind: string | null;
  done_by_name: string | null;
  done_at: string | null;
  done_note: string | null;
}

interface TaskProgressRow {
  id: string;
  message: string;
  order_id: string | null;
  kind: string | null;
  progress: string | null;
  progress_by_name: string | null;
  progress_at: string | null;
  progress_note: string | null;
}

interface TaskMessageRow {
  id: string;
  task_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
  staff_tasks?:
    | { message?: string | null; kind?: string | null; order_id?: string | null }
    | { message?: string | null; kind?: string | null; order_id?: string | null }[]
    | null;
}

interface BusShipmentRow {
  id: string;
  bus_company: string;
  destination: string;
  box_count: number | null;
  recorded_by_name: string | null;
  created_at: string;
}

const CUSTOMER_RETURN_LABELS: Record<string, string> = {
  opened: 'Logged customer return',
  arrived: 'Marked return arrived',
  checked: 'Checked returned items',
  restocked: 'Put returned items back on shelf',
  outcome_done: 'Completed return outcome',
  photos: 'Uploaded return photos',
  closed: 'Closed return case',
  decided: 'Recorded return decision',
  waiting_customer: 'Waiting on customer reply',
  second_hand: 'Marked item second-hand',
};

const SUPPLIER_RETURN_LABELS: Record<string, string> = {
  reported: 'Reported damaged item',
  handed_back: 'Handed back damaged item',
  replaced: 'Recorded replacement received',
  closed: 'Closed supplier return',
  cancelled: 'Cancelled supplier return',
};

export async function fetchOpsActivity(
  supabase: SupabaseClient,
  window: ActivityWindow,
  directory: ActivityDirectory,
  target: ActivityTarget
): Promise<StaffActivityItem[]> {
  const [crEventsRes, srEventsRes, doneTasksRes, progressTasksRes, taskMsgsRes, busRes] =
    await Promise.all([
      supabase
        .from('customer_return_events')
        .select('id, return_id, event, note, actor_name, created_at, customer_returns(case_no, order_id)')
        .gte('created_at', window.startIso)
        .lte('created_at', window.endIso)
        .order('created_at', { ascending: false }),
      supabase
        .from('supplier_return_events')
        // Confidentiality: NEVER select amount, supplier_id, suppliers, or unit_cost
        .select('id, return_id, event, qty, note, actor_name, created_at, supplier_returns(return_no, products(name, variant_name))')
        .gte('created_at', window.startIso)
        .lte('created_at', window.endIso)
        .order('created_at', { ascending: false }),
      supabase
        .from('staff_tasks')
        .select('id, message, order_id, kind, done_by_name, done_at, done_note')
        .gte('done_at', window.startIso)
        .lte('done_at', window.endIso)
        .order('done_at', { ascending: false }),
      supabase
        .from('staff_tasks')
        .select('id, message, order_id, kind, progress, progress_by_name, progress_at, progress_note')
        .gte('progress_at', window.startIso)
        .lte('progress_at', window.endIso)
        .order('progress_at', { ascending: false }),
      supabase
        .from('staff_task_messages')
        .select('id, task_id, author_id, author_name, body, created_at, staff_tasks(message, kind, order_id)')
        .gte('created_at', window.startIso)
        .lte('created_at', window.endIso)
        .order('created_at', { ascending: false }),
      supabase
        .from('bus_shipments')
        .select('id, bus_company, destination, box_count, recorded_by_name, created_at')
        .gte('created_at', window.startIso)
        .lte('created_at', window.endIso)
        .order('created_at', { ascending: false }),
    ]);

  if (crEventsRes.error) throw crEventsRes.error;
  if (srEventsRes.error) throw srEventsRes.error;
  if (doneTasksRes.error) throw doneTasksRes.error;
  if (progressTasksRes.error) throw progressTasksRes.error;
  if (taskMsgsRes.error) throw taskMsgsRes.error;
  if (busRes.error) throw busRes.error;

  const items: StaffActivityItem[] = [];

  for (const ev of (crEventsRes.data || []) as CustomerReturnEventRow[]) {
    if (isSystemActor(ev.actor_name)) continue;
    const match = directory.matchesTarget(target, { name: ev.actor_name });
    if (!match.matched) continue;

    const ret = one(ev.customer_returns);
    const casePart = ret?.case_no ? `Return #${ret.case_no}` : 'Customer return';
    const orderPart = ret?.order_id ? ` · Order ${shortOrder(ret.order_id)}` : '';

    items.push({
      id: `cust_ret:${ev.id}`,
      category: 'returns',
      actionLabel: CUSTOMER_RETURN_LABELS[ev.event] || `Return: ${ev.event}`,
      title: `${casePart}${orderPart}`,
      detail: sanitizeReason(ev.note),
      actorName: match.displayName,
      timestamp: ev.created_at,
      href: '/dashboard/inventory/returns',
    });
  }

  for (const ev of (srEventsRes.data || []) as SupplierReturnEventRow[]) {
    if (isSystemActor(ev.actor_name)) continue;
    const match = directory.matchesTarget(target, { name: ev.actor_name });
    if (!match.matched) continue;

    const sr = one(ev.supplier_returns);
    const productName = formatProductName(sr?.products);
    const returnNo = sr?.return_no ? `${sr.return_no} · ` : '';
    const badges: StaffActivityBadge[] = [];
    if (ev.qty) badges.push({ label: `${ev.qty} pc${ev.qty === 1 ? '' : 's'}`, tone: 'neutral' });

    items.push({
      id: `sup_ret:${ev.id}`,
      category: 'returns',
      actionLabel: SUPPLIER_RETURN_LABELS[ev.event] || `Supplier return: ${ev.event}`,
      title: `${returnNo}${productName}`,
      detail: sanitizeReason(ev.note),
      actorName: match.displayName,
      timestamp: ev.created_at,
      href: '/dashboard/inventory/supplier-returns',
      badges: badges.length > 0 ? badges : undefined,
    });
  }

  for (const t of (doneTasksRes.data || []) as TaskDoneRow[]) {
    if (!t.done_at || isSystemActor(t.done_by_name)) continue;
    const match = directory.matchesTarget(target, { name: t.done_by_name });
    if (!match.matched) continue;

    const label =
      t.kind === 'put_back'
        ? 'Completed put-back task'
        : t.kind === 'note'
          ? 'Answered note'
          : 'Completed task';

    items.push({
      id: `task_done:${t.id}`,
      category: 'tasks',
      actionLabel: label,
      title: t.order_id ? `Order ${shortOrder(t.order_id)} · ${t.message}` : t.message,
      detail: sanitizeReason(t.done_note),
      actorName: match.displayName,
      timestamp: t.done_at,
      href: t.order_id ? `/dashboard/orders/${t.order_id}` : '/dashboard/tasks',
      badges: [{ label: 'Done', tone: 'success' }],
    });
  }

  for (const t of (progressTasksRes.data || []) as TaskProgressRow[]) {
    if (!t.progress_at || isSystemActor(t.progress_by_name)) continue;
    const match = directory.matchesTarget(target, { name: t.progress_by_name });
    if (!match.matched) continue;

    const isProblem = t.progress === 'problem';
    items.push({
      id: `task_prog:${t.id}:${t.progress_at}`,
      category: 'tasks',
      actionLabel: isProblem ? 'Reported task problem' : 'Updated task progress',
      title: t.order_id ? `Order ${shortOrder(t.order_id)} · ${t.message}` : t.message,
      detail: sanitizeReason(t.progress_note),
      actorName: match.displayName,
      timestamp: t.progress_at,
      href: t.order_id ? `/dashboard/orders/${t.order_id}` : '/dashboard/tasks',
      badges: [
        {
          label: isProblem ? 'Problem' : 'Working on it',
          tone: isProblem ? 'danger' : 'info',
        },
      ],
    });
  }

  for (const msg of (taskMsgsRes.data || []) as TaskMessageRow[]) {
    if (!msg.author_id && isSystemActor(msg.author_name)) continue;
    const match = directory.matchesTarget(target, { id: msg.author_id, name: msg.author_name });
    if (!match.matched) continue;

    const parent = one(msg.staff_tasks);
    items.push({
      id: `task_msg:${msg.id}`,
      category: 'tasks',
      actionLabel: parent?.kind === 'note' ? 'Replied on note' : 'Replied on task',
      title: parent?.order_id
        ? `Order ${shortOrder(parent.order_id)} · ${parent.message || 'Task'}`
        : parent?.message || 'Task reply',
      detail: sanitizeReason(msg.body),
      actorName: match.displayName,
      timestamp: msg.created_at,
      href: parent?.order_id ? `/dashboard/orders/${parent.order_id}` : '/dashboard/tasks',
    });
  }

  for (const b of (busRes.data || []) as BusShipmentRow[]) {
    if (isSystemActor(b.recorded_by_name)) continue;
    const match = directory.matchesTarget(target, { name: b.recorded_by_name });
    if (!match.matched) continue;

    const boxes = Number(b.box_count) || 1;
    items.push({
      id: `bus:${b.id}`,
      category: 'shipping',
      actionLabel: 'Recorded bus shipment',
      title: `${b.bus_company} → ${b.destination}`,
      actorName: match.displayName,
      timestamp: b.created_at,
      href: '/dashboard/bus-shipping',
      badges: [{ label: `${boxes} box${boxes === 1 ? '' : 'es'}`, tone: 'info' }],
    });
  }

  return items;
}
