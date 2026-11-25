import { SupabaseClient } from '@supabase/supabase-js';
import type { StaffTaskMessage } from '@/types/staff-tasks.types';
import { addOrderNote } from '@/lib/services/order-trail-service';
import { TaskError, TASKS_PAGE, type TaskCaller } from './staff-task-service';

/*
 * Replies on a task (owner, 2026-11-23): staff ask a question or reply, owners
 * answer. Staff writing sends the owner who assigned it a bell; an owner writing
 * makes the task pop up again for the staff member (staff don't watch the bell).
 */

interface TaskRef {
  id: string;
  message: string;
  status: string;
  seen_at: string | null;
  order_id: string | null;
  assignee_ids: string[];
  assigned_by_name: string;
  kind: string | null;
  needs_answer: boolean | null;
  sender_ids: string[] | null;
  assignee_name: string;
}

async function taskFor(supabase: SupabaseClient, taskId: string, caller: TaskCaller): Promise<{ task: TaskRef; isAssignee: boolean }> {
  const { data, error } = await supabase
    .from('staff_tasks')
    .select('id, message, status, seen_at, order_id, assignee_ids, assigned_by_name, kind, needs_answer, sender_ids, assignee_name')
    .eq('id', taskId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new TaskError('Task not found');
  const isAssignee = (data.assignee_ids as string[]).includes(caller.id);
  // Order notes: the person who wrote it is the other side of the conversation.
  const isSender = data.kind === 'note' && ((data.sender_ids as string[] | null) || []).includes(caller.id);
  if (!isAssignee && !isSender && !caller.isManagement) throw new TaskError('This task is not yours');
  return { task: data as TaskRef, isAssignee };
}

/** The replies on a task, oldest first. Opening them marks them read for the caller's side. */
export async function listTaskMessages(supabase: SupabaseClient, taskId: string, caller: TaskCaller): Promise<StaffTaskMessage[]> {
  const { isAssignee } = await taskFor(supabase, taskId, caller);
  const { data, error } = await supabase
    .from('staff_task_messages')
    .select('id, author_name, from_owner, body, photo_url, created_at')
    .eq('task_id', taskId)
    .order('created_at')
    .limit(200);
  if (error) throw error;
  await supabase
    .from('staff_tasks')
    .update(isAssignee ? { staff_read_at: new Date().toISOString() } : { owner_read_at: new Date().toISOString() })
    .eq('id', taskId);
  return (data || []).map((m) => ({
    id: m.id as string,
    authorName: m.author_name as string,
    fromOwner: m.from_owner as boolean,
    body: m.body as string,
    photoUrl: (m.photo_url as string | null) || null,
    createdAt: m.created_at as string,
  }));
}

/** Only photos uploaded through /api/tasks/photo (the staff-tasks bucket). */
function taskPhoto(url: unknown): string | null {
  const u = String(url || '').trim();
  if (!u) return null;
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/staff-tasks/`;
  if (!u.startsWith(prefix)) throw new TaskError('The photo was not uploaded properly. Try again.');
  return u;
}

export async function postTaskMessage(
  supabase: SupabaseClient,
  taskId: string,
  caller: TaskCaller,
  bodyIn: string,
  photoUrlIn?: unknown
): Promise<void> {
  const body = String(bodyIn || '').trim();
  const photoUrl = taskPhoto(photoUrlIn);
  if (!body && !photoUrl) throw new TaskError('Write a message or add a photo first');
  if (body.length > 1000) throw new TaskError('The message is too long (1,000 characters max)');
  const { task, isAssignee } = await taskFor(supabase, taskId, caller);
  if (task.status === 'cancelled') throw new TaskError('This task was cancelled');
  const fromOwner = !isAssignee;
  const now = new Date().toISOString();
  const isNote = task.kind === 'note';
  // Answering a note closes it (for everyone, when it went to a team).
  const answers = isNote && isAssignee && task.status === 'open';

  const { error } = await supabase.from('staff_task_messages').insert({
    task_id: taskId,
    author_id: caller.id,
    author_name: caller.name,
    from_owner: fromOwner,
    body,
    photo_url: photoUrl,
  });
  if (error) throw error;
  // The writer has read everything up to their own message.
  const { error: upErr } = await supabase
    .from('staff_tasks')
    .update({
      last_message_at: now,
      last_message_from_owner: fromOwner,
      ...(fromOwner ? { owner_read_at: now } : { staff_read_at: now }),
      // Asking about the task means they saw it.
      ...(!fromOwner && !task.seen_at ? { seen_at: now, seen_by_name: caller.name } : {}),
      ...(answers ? { status: 'done', done_at: now, done_by_name: caller.name } : {}),
    })
    .eq('id', taskId);
  if (upErr) throw upErr;

  if (isNote) {
    // Keep the conversation in the order's Activity & Notes too. The sender gets a pop-up, not a bell.
    if (task.order_id && body) {
      const label = fromOwner ? `Reply to ${task.assignee_name}` : `Answer to ${task.assigned_by_name}`;
      await addOrderNote(supabase, task.order_id, `${label}: ${body}`, caller.name);
    }
    return;
  }

  if (!fromOwner && task.assigned_by_name && task.assigned_by_name !== caller.name) {
    const order = task.order_id ? ` (#${String(task.order_id).slice(0, 7).toUpperCase()})` : '';
    const text = `${caller.name}${order} on "${task.message}": ${body || ''}${photoUrl ? `${body ? ' ' : ''}(photo)` : ''}`;
    await supabase.from('notifications').insert({
      sales_person_name: task.assigned_by_name,
      title: 'Task reply',
      message: text.length > 240 ? `${text.slice(0, 237)}...` : text,
      link: `${TASKS_PAGE}?task=${taskId}`,
      is_read: false,
    });
  }
}
