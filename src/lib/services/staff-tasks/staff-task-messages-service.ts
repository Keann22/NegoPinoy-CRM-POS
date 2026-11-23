import { SupabaseClient } from '@supabase/supabase-js';
import type { StaffTaskMessage } from '@/types/staff-tasks.types';
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
}

async function taskFor(supabase: SupabaseClient, taskId: string, caller: TaskCaller): Promise<{ task: TaskRef; isAssignee: boolean }> {
  const { data, error } = await supabase
    .from('staff_tasks')
    .select('id, message, status, seen_at, order_id, assignee_ids, assigned_by_name')
    .eq('id', taskId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new TaskError('Task not found');
  const isAssignee = (data.assignee_ids as string[]).includes(caller.id);
  if (!isAssignee && !caller.isManagement) throw new TaskError('This task is not yours');
  return { task: data as TaskRef, isAssignee };
}

/** The replies on a task, oldest first. Opening them marks them read for the caller's side. */
export async function listTaskMessages(supabase: SupabaseClient, taskId: string, caller: TaskCaller): Promise<StaffTaskMessage[]> {
  const { isAssignee } = await taskFor(supabase, taskId, caller);
  const { data, error } = await supabase
    .from('staff_task_messages')
    .select('id, author_name, from_owner, body, created_at')
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
    createdAt: m.created_at as string,
  }));
}

export async function postTaskMessage(supabase: SupabaseClient, taskId: string, caller: TaskCaller, bodyIn: string): Promise<void> {
  const body = String(bodyIn || '').trim();
  if (!body) throw new TaskError('Write a message first');
  if (body.length > 1000) throw new TaskError('The message is too long (1,000 characters max)');
  const { task, isAssignee } = await taskFor(supabase, taskId, caller);
  if (task.status === 'cancelled') throw new TaskError('This task was cancelled');
  const fromOwner = !isAssignee;
  const now = new Date().toISOString();

  const { error } = await supabase.from('staff_task_messages').insert({
    task_id: taskId,
    author_id: caller.id,
    author_name: caller.name,
    from_owner: fromOwner,
    body,
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
    })
    .eq('id', taskId);
  if (upErr) throw upErr;

  if (!fromOwner && task.assigned_by_name && task.assigned_by_name !== caller.name) {
    const order = task.order_id ? ` (#${String(task.order_id).slice(0, 7).toUpperCase()})` : '';
    const text = `${caller.name}${order} on "${task.message}": ${body}`;
    await supabase.from('notifications').insert({
      sales_person_name: task.assigned_by_name,
      title: 'Task reply',
      message: text.length > 240 ? `${text.slice(0, 237)}...` : text,
      link: `${TASKS_PAGE}?task=${taskId}`,
      is_read: false,
    });
  }
}
