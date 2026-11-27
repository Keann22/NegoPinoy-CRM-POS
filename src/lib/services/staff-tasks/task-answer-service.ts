import type { SupabaseClient } from '@supabase/supabase-js';
import { cancelOrder, OrderCancelError } from '@/lib/services/orders/order-cancel-service';
import { releaseShipHold } from '@/lib/services/shipping/ship-hold-service';
import { shortOrderId } from '@/lib/shipping/ship-hold-rules';
import type { TaskAnswer } from '@/types/staff-tasks.types';
import { getRow, markDone, TaskError, TASKS_PAGE, type TaskCaller } from './staff-task-service';
import { tellWarehouseOkToShip } from './ok-to-ship-service';

/*
 * Answer buttons on a task about an order (owner, 2026-11-25). Sales answered
 * "check with the customer: ship or cancel?" tasks with free-text replies, so
 * the task stayed open and nothing changed on the order. Each button now does
 * the real thing and closes the task with the outcome as its Done note:
 *   OK to ship          releases the order's hold (if any), then Done, and tells
 *                       the warehouse (ok-to-ship-service.ts, owner 2026-11-26).
 *   Customer hasn't
 *   replied             progress 'waiting': no late flag, back in 4 hours.
 *   Cancel the order    unpaid: cancels it (stock back, put-back task if picked).
 *                       Paid: can't be cancelled here; tells the owners
 *                       (Problem) so they decide store credit or refund.
 * Don't ship yet and Ship by bus use the hold and bus dialogs (they close the task too).
 */

export interface AnswerCaller extends TaskCaller {
  /** Sales or owners: the people who talk to the customer. */
  canAnswer: boolean;
}

export interface AnswerResult {
  /** What happened, for the toast. */
  outcome: string;
}

const CLOSED = ['Shipped', 'Delivered', 'Completed', 'Payment Received (COD)', 'Cancelled', 'Returned'];

async function loadOrderTask(supabase: SupabaseClient, taskId: string, caller: AnswerCaller) {
  const row = await getRow(supabase, taskId);
  if (!caller.canAnswer) throw new TaskError('Only sales and the owners can answer for the customer.');
  if (!row.assignee_ids.includes(caller.id) && !caller.isManagement) throw new TaskError('This task is not yours');
  if (row.status !== 'open') throw new TaskError(row.status === 'done' ? 'Already done' : 'This task was cancelled');
  if (row.kind || !row.order_id) throw new TaskError('This task is not about an order.');
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, status, amount_paid, balance_due, total_amount')
    .eq('id', row.order_id)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw new TaskError('Order not found.');
  return { row, order: order as { id: string; status: string; amount_paid: number | null } };
}

const clean = (s: unknown) => String(s || '').trim().slice(0, 1000);

export async function answerTask(
  supabase: SupabaseClient,
  taskId: string,
  caller: AnswerCaller,
  answer: TaskAnswer,
  noteIn?: string | null,
): Promise<AnswerResult> {
  const note = clean(noteIn);
  const { row, order } = await loadOrderTask(supabase, taskId, caller);
  const short = shortOrderId(order.id);

  if (answer === 'waiting') {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('staff_tasks')
      .update({
        progress: 'waiting',
        progress_note: note || 'Asked customer, waiting for reply',
        progress_at: now,
        progress_by_name: caller.name,
        ...(row.seen_at ? {} : { seen_at: now, seen_by_name: caller.name }),
      })
      .eq('id', taskId)
      .eq('status', 'open');
    if (error) throw error;
    return { outcome: 'We\'ll ask you again in 4 hours.' };
  }

  if (CLOSED.includes(order.status)) {
    throw new TaskError(`${short} is already ${order.status}. Tap Done if nothing else is needed.`);
  }

  if (answer === 'ok_to_ship') {
    const { data: hold, error } = await supabase
      .from('order_ship_holds')
      .select('id')
      .eq('order_id', order.id)
      .is('released_at', null)
      .maybeSingle();
    if (error) throw error;
    if (hold) await releaseShipHold(supabase, hold.id as string, caller.name);
    const parts = ['OK to ship', hold ? 'hold released' : null, note || null].filter(Boolean);
    await markDone(supabase, taskId, caller, { note: parts.join(' · ') });
    const told = await tellWarehouseOkToShip(supabase, row, { id: caller.id, name: caller.name }, note || null);
    const warehouse = told.told.length || told.created ? ' The warehouse was told.' : '';
    return { outcome: (hold ? 'Hold released: the order is back on Ready to ship.' : `${short} is marked OK to ship.`) + warehouse };
  }

  // answer === 'cancel'
  if (!note) throw new TaskError('Write why the order is cancelled (what the customer said).');
  try {
    const result = await cancelOrder(
      supabase,
      { orderId: order.id, reason: note, source: 'task answer', taskId },
      { ...caller, canCancel: caller.canAnswer },
    );
    if (!result.cancelled) {
      return { outcome: result.outcome };
    }
    // trg_zz_order_cancel_cleanup cancelled open non-put-back tasks during the status update;
    // flip this answered task to 'done' with the outcome note and notify the assigner.
    const now = new Date().toISOString();
    const doneNote = `Cancelled the order: ${note}`;
    await supabase
      .from('staff_tasks')
      .update({
        status: 'done',
        cancelled_at: null,
        done_at: now,
        done_by_name: caller.name,
        done_note: doneNote,
        seen_at: row.seen_at || now,
        seen_by_name: row.seen_at ? undefined : caller.name,
        ...(caller.isManagement ? { owner_read_at: now } : {}),
      })
      .eq('id', taskId);

    if (row.assigned_by_name && row.assigned_by_name !== caller.name) {
      await supabase.from('notifications').insert({
        sales_person_name: row.assigned_by_name,
        title: 'Task done',
        message: `${caller.name} (${short}): ${row.message} — "${doneNote}"`.slice(0, 240),
        link: `${TASKS_PAGE}?task=${row.id}`,
        is_read: false,
      });
    }
    return { outcome: result.outcome };
  } catch (e) {
    if (e instanceof OrderCancelError) throw new TaskError(e.message);
    throw e;
  }
}
