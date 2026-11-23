import { SupabaseClient } from '@supabase/supabase-js';
import { staffRoleNames } from '@/lib/auth/staff-roles';
import type { NewStaffTask, StaffTask, TaskPerson } from '@/types/staff-tasks.types';

/*
 * Staff tasks (owner, 2026-11-23): instead of messaging Jas "pwede na yang
 * ipadala" with a screenshot, the owners assign a task. The staff member gets a
 * pop-up until they tap "Nakita ko", then it stays on their dashboard until Done.
 * The owner who assigned it gets a bell when it's done. Server only.
 */

export class TaskError extends Error {}

export const TASKS_PAGE = '/dashboard/tasks';

/** Accounts that are one person (Jas has three). Everyone else: same full name = same person. */
const SAME_PERSON: { label: string; emails: string[] }[] = [
  { label: 'Jas', emails: ['jas@gmail.com', 'jas@usares.com', 'jassy@gmail.com'] },
];

const SELECT = 'id, message, order_id, assignee_name, assigned_by_name, due_at, status, seen_at, seen_by_name, progress, progress_note, progress_at, progress_by_name, done_at, done_by_name, done_note, done_photo_url, created_at, orders(status, customers(full_name))';

interface AuthUser {
  id: string;
  email?: string;
  app_metadata?: unknown;
  user_metadata?: Record<string, unknown>;
  last_sign_in_at?: string | null;
}

type Person = TaskPerson & { ids: string[]; lastSignIn: string };

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

function fullName(u: AuthUser): string {
  const m = u.user_metadata || {};
  return `${m.first_name || ''} ${m.last_name || ''}`.trim() || u.email || 'Staff';
}

async function staffAccounts(supabase: SupabaseClient): Promise<AuthUser[]> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return (data.users as AuthUser[]).filter((u) =>
    staffRoleNames(u).length > 0 && !String(u.email || '').toLowerCase().endsWith('.test'));
}

/** Staff to assign to, most recently active first. */
async function people(supabase: SupabaseClient): Promise<Person[]> {
  const groups = new Map<string, { label: string; known: boolean; users: AuthUser[] }>();
  for (const u of await staffAccounts(supabase)) {
    const email = String(u.email || '').toLowerCase();
    const known = SAME_PERSON.find((g) => g.emails.includes(email));
    const groupKey = known ? `known:${known.label}` : `name:${fullName(u).toLowerCase()}`;
    const g = groups.get(groupKey) || { label: known?.label || fullName(u), known: !!known, users: [] };
    g.users.push(u);
    groups.set(groupKey, g);
  }
  return Array.from(groups.values())
    .map(({ label, known, users }) => {
      const ids = users.map((u) => u.id).sort();
      // Same-name accounts: show the name as written on the most recently used one.
      const latest = [...users].sort((x, y) => String(y.last_sign_in_at || '').localeCompare(String(x.last_sign_in_at || '')))[0];
      const name = known ? label : fullName(latest);
      const roles = Array.from(new Set(users.flatMap((u) => staffRoleNames(u))));
      const lastSignIn = users.map((u) => u.last_sign_in_at || '').sort().pop() || '';
      return { key: ids.join(','), name, roles, ids, lastSignIn };
    })
    .sort((a, b) => b.lastSignIn.localeCompare(a.lastSignIn));
}

export async function listPeople(supabase: SupabaseClient): Promise<TaskPerson[]> {
  return (await people(supabase)).map(({ key, name, roles }) => ({ key, name, roles }));
}

interface TaskRow {
  id: string; message: string; order_id: string | null; assignee_name: string; assigned_by_name: string;
  due_at: string | null; status: StaffTask['status']; seen_at: string | null; seen_by_name: string | null;
  progress: StaffTask['progress']; progress_note: string | null; progress_at: string | null; progress_by_name: string | null;
  done_at: string | null; done_by_name: string | null; done_note: string | null; done_photo_url: string | null;
  created_at: string;
  orders?: OrderJoin | OrderJoin[] | null;
}
type OrderJoin = { status: string | null; customers?: { full_name: string | null } | { full_name: string | null }[] | null };

function toTask(r: TaskRow): StaffTask {
  const order = one(r.orders);
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
  };
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
  return ((data || []) as unknown as TaskRow[]).map(toTask);
}

/** Owners' view: every open task, and tasks done or cancelled in the last `days` days. */
export async function listAllTasks(supabase: SupabaseClient, days = 14): Promise<StaffTask[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from('staff_tasks')
    .select(SELECT)
    .or(`status.eq.open,created_at.gte.${since}`)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data || []) as unknown as TaskRow[]).map(toTask);
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
  return ((data || []) as unknown as TaskRow[]).map(toTask);
}

export async function createTask(
  supabase: SupabaseClient,
  input: NewStaffTask,
  by: { id: string; name: string }
): Promise<string> {
  const message = String(input.message || '').trim();
  if (!message) throw new TaskError('Write the task first');
  if (message.length > 1000) throw new TaskError('The task is too long (1,000 characters max)');
  const person = (await people(supabase)).find((p) => p.key === input.personKey);
  if (!person) throw new TaskError('Pick who should do it');
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new TaskError('The deadline is not a valid date');

  const { data, error } = await supabase
    .from('staff_tasks')
    .insert({
      message,
      order_id: input.orderId || null,
      assignee_ids: person.ids,
      assignee_name: person.name,
      assigned_by_id: by.id,
      assigned_by_name: by.name,
      due_at: dueAt ? dueAt.toISOString() : null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

async function getRow(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('staff_tasks')
    .select('id, message, status, assignee_ids, assignee_name, assigned_by_name, seen_at, order_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new TaskError('Task not found');
  return data;
}

export interface TaskCaller { id: string; name: string; isManagement: boolean }

/** "Nakita ko": the assignee saw the task. */
export async function markSeen(supabase: SupabaseClient, id: string, caller: TaskCaller): Promise<void> {
  const row = await getRow(supabase, id);
  if (!row.assignee_ids.includes(caller.id)) throw new TaskError('This task is not yours');
  if (row.seen_at) return;
  const { error } = await supabase
    .from('staff_tasks')
    .update({ seen_at: new Date().toISOString(), seen_by_name: caller.name })
    .eq('id', id);
  if (error) throw error;
}

async function bellOwner(supabase: SupabaseClient, row: { id: string; message: string; order_id: string | null; assigned_by_name: string }, caller: TaskCaller, title: string, note: string | null) {
  // Someone else acting for them (an owner): no bell to themselves.
  if (!row.assigned_by_name || row.assigned_by_name === caller.name) return;
  const order = row.order_id ? ` (#${String(row.order_id).slice(0, 7).toUpperCase()})` : '';
  const text = `${caller.name}${order}: ${row.message}${note ? ` — "${note}"` : ''}`;
  await supabase.from('notifications').insert({
    sales_person_name: row.assigned_by_name,
    title,
    message: text.length > 240 ? `${text.slice(0, 237)}...` : text,
    link: `${TASKS_PAGE}?task=${row.id}`,
    is_read: false,
  });
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
    })
    .eq('id', id)
    .eq('status', 'open');
  if (error) throw error;

  await bellOwner(supabase, row, caller, 'Task done', note);
}

/** Owners take a task back (wrong person, not needed anymore). */
export async function cancelTask(supabase: SupabaseClient, id: string, caller: TaskCaller): Promise<void> {
  if (!caller.isManagement) throw new TaskError('Only the owners can cancel a task');
  const row = await getRow(supabase, id);
  if (row.status !== 'open') throw new TaskError('Only open tasks can be cancelled');
  const { error } = await supabase
    .from('staff_tasks')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
