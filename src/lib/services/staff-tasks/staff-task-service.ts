import { SupabaseClient } from '@supabase/supabase-js';
import type { NewStaffTask, StaffTask } from '@/types/staff-tasks.types';
import { getShipContexts, OPEN_ORDER_STATUSES, type OrderShipContext } from '@/lib/services/order-ship-context-service';
import {
  fullName, listPeople, ownerNames, people, staffAccounts, type AuthUser, type Person,
} from './task-people';

export { fullName, listPeople, people, staffAccounts, type AuthUser, type Person };

/*
 * Staff tasks (owner, 2026-11-23): instead of messaging Jas "pwede na yang
 * ipadala" with a screenshot, the owners assign a task. The staff member gets a
 * pop-up until they tap "Nakita ko", then it stays on their dashboard until Done.
 * The owner who assigned it gets a bell when it's done. Server only.
 */

export class TaskError extends Error {}

export const TASKS_PAGE = '/dashboard/tasks';

export const SELECT = 'id, message, order_id, assignee_name, assigned_by_name, due_at, status, seen_at, seen_by_name, progress, progress_note, progress_at, progress_by_name, done_at, done_by_name, done_note, done_photo_url, created_at, last_message_at, last_message_from_owner, staff_read_at, owner_read_at, group_id, kind, needs_answer, team, sender_nudged_at, staff_task_messages(count), orders(status, customers(full_name))';

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export interface TaskRow {
  id: string; message: string; order_id: string | null; assignee_name: string; assigned_by_name: string;
  due_at: string | null; status: StaffTask['status']; seen_at: string | null; seen_by_name: string | null;
  progress: StaffTask['progress']; progress_note: string | null; progress_at: string | null; progress_by_name: string | null;
  done_at: string | null; done_by_name: string | null; done_note: string | null; done_photo_url: string | null;
  created_at: string;
  group_id: string | null;
  kind: string | null;
  needs_answer?: boolean | null; team?: string | null; sender_nudged_at?: string | null;
  last_message_at: string | null; last_message_from_owner: boolean | null; staff_read_at: string | null; owner_read_at: string | null;
  staff_task_messages?: { count: number }[] | null;
  orders?: OrderJoin | OrderJoin[] | null;
}
type OrderJoin = { status: string | null; customers?: { full_name: string | null } | { full_name: string | null }[] | null };

/** The other side wrote last and this side hasn't opened the replies since. */
function unread(lastAt: string | null, readAt: string | null): boolean {
  return !!lastAt && (!readAt || readAt < lastAt);
}

/** A note not seen this long after it was sent: the sender is told and the owners see it (owner, 2026-11-25). */
export const NOTE_UNSEEN_MS = 2 * 60 * 60 * 1000;

export function toTask(r: TaskRow): StaffTask {
  const order = one(r.orders);
  const isNote = r.kind === 'note';
  const customer = one(order?.customers);
  return {
    id: r.id,
    message: r.message,
    orderId: r.order_id,
    orderShortId: r.order_id ? `#${String(r.order_id).slice(0, 7).toUpperCase()}` : null,
    orderCustomer: customer?.full_name || null,
    orderStatus: order?.status || null,
    assigneeName: r.assignee_name,
    assignedByName: r.assigned_by_name,
    dueAt: r.due_at,
    status: r.status,
    seenAt: r.seen_at,
    seenByName: r.seen_by_name,
    progress: r.progress,
    progressNote: r.progress_note,
    progressAt: r.progress_at,
    progressByName: r.progress_by_name,
    doneAt: r.done_at,
    doneByName: r.done_by_name,
    doneNote: r.done_note,
    donePhotoUrl: r.done_photo_url,
    createdAt: r.created_at,
    groupId: r.group_id,
    auto: r.kind === 'put_back',
    messageCount: r.staff_task_messages?.[0]?.count ?? 0,
    lastMessageAt: r.last_message_at,
    staffUnread: r.last_message_from_owner === true && unread(r.last_message_at, r.staff_read_at),
    ownerUnread: !isNote && r.last_message_from_owner === false && unread(r.last_message_at, r.owner_read_at),
    isNote,
    needsAnswer: isNote && r.needs_answer !== false,
    team: r.team === 'inventory' || r.team === 'owners' ? r.team : null,
    // The sender's side of a note: they replied, or answered with Tapos na.
    senderUnread: isNote && (
      (r.last_message_from_owner === false && unread(r.last_message_at, r.owner_read_at))
      || (r.needs_answer !== false && r.status === 'done' && unread(r.done_at, r.owner_read_at))
    ),
    unseenTooLong: isNote && r.status === 'open' && !r.seen_at && Date.now() - new Date(r.created_at).getTime() > NOTE_UNSEEN_MS,
    senderNudged: !!r.sender_nudged_at,
  };
}

/**
 * Adds "can this order ship yet?" to tasks about an order: its hold note, what it
 * still owes, and the customer's other open orders (found 2026-11-24, #020106B).
 */
export async function withOrderContext(supabase: SupabaseClient, tasks: StaffTask[]): Promise<StaffTask[]> {
  // Only orders still open: a shipped or cancelled order has nothing left to decide,
  // and put-back tasks are about pieces, not shipping.
  const ids = tasks.filter((t) => !t.auto).map((t) => t.orderId).filter(Boolean) as string[];
  if (ids.length === 0) return tasks;
  let contexts: Map<string, OrderShipContext>;
  try {
    contexts = await getShipContexts(supabase, ids);
  } catch (e) {
    console.error('Task order context failed', e);
    return tasks;
  }
  return tasks.map((t) => {
    const ctx = !t.auto && t.orderId ? contexts.get(t.orderId) : undefined;
    return { ...t, orderContext: ctx && OPEN_ORDER_STATUSES.includes(ctx.status) ? ctx : null };
  });
}

/** For the Assign task dialog: can this order ship yet? */
export async function getOrderContext(supabase: SupabaseClient, orderId: string): Promise<OrderShipContext | null> {
  return (await getShipContexts(supabase, [orderId])).get(orderId) || null;
}

/** The caller's open tasks, plus what they finished in the last 7 days. */
export async function listMyTasks(supabase: SupabaseClient, userId: string): Promise<StaffTask[]> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data, error } = await supabase
    .from('staff_tasks')
    .select(SELECT)
    .contains('assignee_ids', [userId])
    .or(`status.eq.open,and(status.eq.done,done_at.gte.${since})`)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return withOrderContext(supabase, ((data || []) as unknown as TaskRow[]).map(toTask));
}

/** Owners' view: every open task, and tasks done or cancelled in the last `days` days. */
export async function listAllTasks(supabase: SupabaseClient, days = 14): Promise<StaffTask[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from('staff_tasks')
    .select(SELECT)
    .or(`status.eq.open,created_at.gte.${since}`)
    // Order notes have their own lists (sent by me / not seen in 2 hours).
    .or('kind.is.null,kind.neq.note')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return withOrderContext(supabase, ((data || []) as unknown as TaskRow[]).map(toTask));
}

/** Open and recent tasks on one order (shown on the order page). */
export async function listOrderTasks(supabase: SupabaseClient, orderId: string): Promise<StaffTask[]> {
  const { data, error } = await supabase
    .from('staff_tasks')
    .select(SELECT)
    .eq('order_id', orderId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return withOrderContext(supabase, ((data || []) as unknown as TaskRow[]).map(toTask));
}

export async function createTask(
  supabase: SupabaseClient,
  input: NewStaffTask,
  by: { id: string; name: string }
): Promise<string[]> {
  const message = String(input.message || '').trim();
  if (!message) throw new TaskError('Write the task first');
  if (message.length > 1000) throw new TaskError('The task is too long (1,000 characters max)');
  const all = await people(supabase);
  const chosen = all.filter((p) => input.personKeys.includes(p.key));
  if (chosen.length === 0) throw new TaskError('Pick who should do it');
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new TaskError('The deadline is not a valid date');

  // Several people: each gets their own copy (own seen / done), linked by group_id.
  const groupId = chosen.length > 1 ? crypto.randomUUID() : null;
  const { data, error } = await supabase
    .from('staff_tasks')
    .insert(chosen.map((person) => ({
      message,
      order_id: input.orderId || null,
      assignee_ids: person.ids,
      assignee_name: person.name,
      assigned_by_id: by.id,
      assigned_by_name: by.name,
      due_at: dueAt ? dueAt.toISOString() : null,
      group_id: groupId,
    })))
    .select('id');
  if (error) throw error;
  return (data || []).map((r) => r.id as string);
}

export async function getRow(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('staff_tasks')
    .select('id, message, status, due_at, assignee_ids, assignee_name, assigned_by_name, seen_at, order_id, kind, needs_answer, sender_ids')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new TaskError('Task not found');
  return data;
}

export interface TaskCaller { id: string; name: string; isManagement: boolean }

/** "Got it": the assignee saw the task. */
export async function markSeen(supabase: SupabaseClient, id: string, caller: TaskCaller): Promise<void> {
  const row = await getRow(supabase, id);
  if (!row.assignee_ids.includes(caller.id)) throw new TaskError('This task is not yours');
  if (row.seen_at) return;
  const now = new Date().toISOString();
  // "Pasabi lang po" note: seeing it is all it needs.
  const closes = row.kind === 'note' && row.needs_answer === false && row.status === 'open';
  const { error } = await supabase
    .from('staff_tasks')
    .update({
      seen_at: now,
      seen_by_name: caller.name,
      ...(closes ? { status: 'done', done_at: now, done_by_name: caller.name } : {}),
    })
    .eq('id', id);
  if (error) throw error;
}

type BellRow = { id: string; message: string; order_id: string | null; assigned_by_name: string; kind?: string | null };

async function bellOwner(supabase: SupabaseClient, row: BellRow, caller: TaskCaller, title: string, note: string | null) {
  // Automatic put-back task (order cancelled): the owners see it on the Tasks
  // page; only a problem ("can't find the pieces") is worth a bell.
  // Order notes: the sender gets a pop-up instead (sales don't watch the bell).
  if (row.kind === 'note') return;
  const auto = row.kind === 'put_back';
  if (auto && title !== 'Task problem') return;
  const to = auto ? await ownerNames(supabase) : [row.assigned_by_name];
  // Someone else acting for them (an owner): no bell to themselves.
  const names = to.filter((n) => n && n !== caller.name);
  if (names.length === 0) return;
  const order = row.order_id ? ` (#${String(row.order_id).slice(0, 7).toUpperCase()})` : '';
  const firstLine = auto ? row.message.split('\n')[0] : row.message;
  const text = `${caller.name}${order}: ${firstLine}${note ? ` — "${note}"` : ''}`;
  await supabase.from('notifications').insert(names.map((name) => ({
    sales_person_name: name,
    title,
    message: text.length > 240 ? `${text.slice(0, 237)}...` : text,
    link: `${TASKS_PAGE}?task=${row.id}`,
    is_read: false,
  })));
}

/**
 * "Ginagawa na" (working on it, optional note) or "May problema" (can't do it,
 * reason required). A problem sends the owner who assigned it a bell.
 */
export async function setProgress(
  supabase: SupabaseClient,
  id: string,
  caller: TaskCaller,
  progress: 'working' | 'problem',
  noteIn?: string | null
): Promise<void> {
  const row = await getRow(supabase, id);
  if (!row.assignee_ids.includes(caller.id)) throw new TaskError('This task is not yours');
  if (row.status !== 'open') throw new TaskError(row.status === 'done' ? 'Already done' : 'This task was cancelled');
  const note = String(noteIn || '').trim().slice(0, 1000) || null;
  if (progress === 'problem' && !note) throw new TaskError('Write what the problem is');
  if (progress === 'working' && row.due_at && new Date(row.due_at).getTime() < Date.now() && !note) {
    throw new TaskError('Write a short update (e.g. waiting for customer reply)');
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('staff_tasks')
    .update({
      progress,
      progress_note: note,
      progress_at: now,
      progress_by_name: caller.name,
      seen_at: row.seen_at || now,
      seen_by_name: row.seen_at ? undefined : caller.name,
    })
    .eq('id', id)
    .eq('status', 'open');
  if (error) throw error;
  if (progress === 'problem') await bellOwner(supabase, row, caller, 'Task problem', note);
}

/** Done, with an optional note / photo. The owner who assigned it gets a bell. */
export async function markDone(
  supabase: SupabaseClient,
  id: string,
  caller: TaskCaller,
  extra: { note?: string | null; photoUrl?: string | null }
): Promise<void> {
  const row = await getRow(supabase, id);
  if (!row.assignee_ids.includes(caller.id) && !caller.isManagement) throw new TaskError('This task is not yours');
  if (row.status !== 'open') throw new TaskError(row.status === 'done' ? 'Already done' : 'This task was cancelled');
  const now = new Date().toISOString();
  const note = String(extra.note || '').trim().slice(0, 1000) || null;
  const { error } = await supabase
    .from('staff_tasks')
    .update({
      status: 'done',
      done_at: now,
      done_by_name: caller.name,
      done_note: note,
      done_photo_url: extra.photoUrl || null,
      seen_at: row.seen_at || now,
      seen_by_name: row.seen_at ? undefined : caller.name,
      ...(caller.isManagement ? { owner_read_at: now } : {}),
    })
    .eq('id', id)
    .eq('status', 'open');
  if (error) throw error;

  await bellOwner(supabase, row, caller, 'Task done', note);
}

/** Owners take a task back (wrong person, not needed anymore); the writer of a note can too. */
export async function cancelTask(supabase: SupabaseClient, id: string, caller: TaskCaller): Promise<void> {
  const row = await getRow(supabase, id);
  // The person who wrote a note can take it back too.
  const isSender = row.kind === 'note' && (row.sender_ids || []).includes(caller.id);
  if (!caller.isManagement && !isSender) throw new TaskError('Only the owners can cancel a task');
  if (row.status !== 'open') throw new TaskError('Only open tasks can be cancelled');
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('staff_tasks')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      ...(caller.isManagement ? { owner_read_at: now } : {}),
    })
    .eq('id', id);
  if (error) throw error;
}

/** Owners move or clear a task's deadline. */
export async function rescheduleTask(
  supabase: SupabaseClient,
  id: string,
  caller: TaskCaller,
  dueAtIn: string | null,
): Promise<void> {
  if (!caller.isManagement) throw new TaskError('Only the owners can change the deadline');
  const row = await getRow(supabase, id);
  if (row.status !== 'open') throw new TaskError('Only open tasks can be rescheduled');
  const dueAt = dueAtIn ? new Date(dueAtIn) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new TaskError('The deadline is not a valid date');
  const { error } = await supabase
    .from('staff_tasks')
    .update({ due_at: dueAt ? dueAt.toISOString() : null })
    .eq('id', id)
    .eq('status', 'open');
  if (error) throw error;
}

/** Open regular tasks on an order (for ShipHoldDialog's "Also mark Done" list). */
export async function listOpenRegularTasksForOrder(
  supabase: SupabaseClient,
  orderId: string,
  caller: TaskCaller,
): Promise<{ id: string; message: string; assigneeName: string }[]> {
  let q = supabase
    .from('staff_tasks')
    .select('id, message, assignee_name')
    .eq('order_id', orderId)
    .eq('status', 'open')
    .is('kind', null);
  if (!caller.isManagement) q = q.contains('assignee_ids', [caller.id]);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id as string,
    message: r.message as string,
    assigneeName: r.assignee_name as string,
  }));
}
