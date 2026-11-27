import type { SupabaseClient } from '@supabase/supabase-js';
import { addOrderNote } from '@/lib/services/order-trail-service';
import { handleStockStatusTransition } from '@/lib/services/orders/order-update';
import { notifyOwners } from '@/lib/services/customer-returns/customer-return-service';
import { round2 } from '@/lib/services/payments/order-payment-rules';
import { recordStoreCreditEntry } from '@/lib/services/payments/store-credit-service';
import { setProgress, type TaskCaller } from '@/lib/services/staff-tasks/staff-task-service';
import { shortOrderId } from '@/lib/shipping/ship-hold-rules';

export class OrderCancelError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'OrderCancelError';
    this.status = status;
  }
}

export type PaidCancelDisposition = 'store_credit' | 'refund_pending' | 'already_handled';

export interface CancelOrderCaller extends TaskCaller {
  canCancel: boolean;
}

export interface CancelOrderInput {
  orderId: string;
  reason: string;
  paidDisposition?: PaidCancelDisposition;
  source?: string;
  taskId?: string;
}

export interface CancelOrderResult {
  cancelled: boolean;
  requiresOwnerApproval?: boolean;
  outcome: string;
  putBackTaskCreated: boolean;
  putBackAssignees: string | null;
  closedTasksCount: number;
}

const CLOSED_STATUSES = [
  'Cancelled',
  'Returned',
  'Shipped',
  'Delivered',
  'Completed',
  'Payment Received (COD)',
];

const DISPOSITIONS: PaidCancelDisposition[] = ['store_credit', 'refund_pending', 'already_handled'];

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/**
 * Canonical server-side order cancellation workflow.
 * - Enforces reason capture and Sales paid-order guard (owner approval required).
 * - Owners choose paid-amount disposition (store credit / refund / already handled).
 * - Writes order_logs first, guards status update, restores stock_level, and lets
 *   DB triggers restore shelf_stock, create the Al & Edric put-back task, and clean up
 *   open tasks, alerts, issues, pick skips, STAFF_DRAFT demand, pending payments, and siblings.
 */
export async function cancelOrder(
  supabase: SupabaseClient,
  input: CancelOrderInput,
  caller: CancelOrderCaller,
): Promise<CancelOrderResult> {
  if (!caller.canCancel) {
    throw new OrderCancelError('Only Sales and Owners can cancel orders.', 403);
  }
  const orderId = String(input.orderId || '').trim();
  if (!orderId) throw new OrderCancelError('Missing order ID.');
  const reason = String(input.reason || '').trim().slice(0, 1000);
  if (!reason) throw new OrderCancelError('Write why the order is being cancelled.');

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, status, customer_id, amount_paid, balance_due, total_amount, sales_person_name, customers(full_name)')
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr) throw orderErr;
  if (!order) throw new OrderCancelError('Order not found.', 404);

  const short = shortOrderId(order.id);
  if (CLOSED_STATUSES.includes(order.status)) {
    throw new OrderCancelError(`${short} is already ${order.status}.`);
  }

  const customerName = one(order.customers as { full_name: string | null } | { full_name: string | null }[] | null)?.full_name || 'Customer';
  const paid = round2(Number(order.amount_paid || 0));

  if (paid > 0.009 && !caller.isManagement) {
    if (input.taskId) {
      await setProgress(
        supabase,
        input.taskId,
        caller,
        'problem',
        `Customer wants to cancel ${short}, but ₱${paid.toLocaleString('en-PH')} is paid: store credit or refund? (${reason})`,
      );
    } else {
      await notifyOwners(
        supabase,
        'Paid order cancel request',
        `${caller.name} requested to cancel ${short} (${customerName}) with ₱${paid.toLocaleString('en-PH')} paid. Reason: ${reason}. Decide store credit or refund.`,
        undefined,
        `/dashboard/orders/${order.id}`,
      );
      await addOrderNote(
        supabase,
        order.id,
        `Cancel requested (paid ₱${paid.toLocaleString('en-PH')} — waiting for owner decision): ${reason}`,
        caller.name,
      );
    }
    return {
      cancelled: false,
      requiresOwnerApproval: true,
      outcome: 'The owners were told (this order has a payment). They decide store credit or refund.',
      putBackTaskCreated: false,
      putBackAssignees: null,
      closedTasksCount: 0,
    };
  }

  if (paid > 0.009 && caller.isManagement) {
    if (!input.paidDisposition || !DISPOSITIONS.includes(input.paidDisposition)) {
      throw new OrderCancelError('Choose what to do with the paid amount (store credit, refund, or already handled).');
    }
  }

  // Count open non-put-back tasks before the cleanup trigger closes them.
  const { count: openTasksCount } = await supabase
    .from('staff_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', order.id)
    .eq('status', 'open')
    .or('kind.is.null,kind.neq.put_back');

  const closedTasksCount = Math.max(0, (openTasksCount || 0) - (input.taskId ? 1 : 0));

  // Log first so trg_put_back_task skips its fallback row.
  const { data: logRow, error: logErr } = await supabase
    .from('order_logs')
    .insert({
      order_id: order.id,
      status: 'Cancelled',
      user_name: caller.name,
      snapshot_data: {
        from_status: order.status,
        reason,
        via: input.source || 'app',
        ...(paid > 0.009 ? { paid, paidDisposition: input.paidDisposition } : {}),
      },
    })
    .select('id')
    .maybeSingle();
  if (logErr) throw logErr;

  const { data: updated, error: upErr } = await supabase
    .from('orders')
    .update({ status: 'Cancelled', completed_at: null, not_for_shipping_reason: null })
    .eq('id', order.id)
    .eq('status', order.status)
    .select('id');

  if (upErr || !updated || updated.length === 0) {
    if (logRow?.id) await supabase.from('order_logs').delete().eq('id', logRow.id);
    if (upErr) throw upErr;
    throw new OrderCancelError('Order status already changed. Refresh and try again.', 409);
  }

  // Restore stock_level (DB triggers handle shelf_stock, put-back task, and cleanup).
  await handleStockStatusTransition(supabase, order.id, order.status, 'Cancelled');

  if (paid > 0.009 && caller.isManagement && input.paidDisposition) {
    if (input.paidDisposition === 'store_credit') {
      if (!order.customer_id) {
        throw new OrderCancelError('Order has no customer linked to receive store credit.');
      }
      const { data: cust, error: custErr } = await supabase
        .from('customers')
        .select('store_credit')
        .eq('id', order.customer_id)
        .single();
      if (custErr || !cust) throw new OrderCancelError('Customer not found for store credit.');
      const nextCredit = round2((Number(cust.store_credit) || 0) + paid);
      const { error: credErr } = await supabase
        .from('customers')
        .update({ store_credit: nextCredit })
        .eq('id', order.customer_id);
      if (credErr) throw credErr;

      await recordStoreCreditEntry(supabase, {
        customerId: order.customer_id,
        amount: paid,
        balanceAfter: nextCredit,
        reason: 'cancelled_order',
        orderId: order.id,
        createdByName: caller.name,
      });
      await supabase.from('order_logs').insert({
        order_id: order.id,
        status: 'Store credit issued',
        user_name: caller.name,
        snapshot_data: { amount: paid, reason: 'Cancelled paid order' },
      });
    } else if (input.paidDisposition === 'refund_pending') {
      await notifyOwners(
        supabase,
        'Refund needed: cancelled paid order',
        `${short} (${customerName}) cancelled by ${caller.name}. Refund ₱${paid.toLocaleString('en-PH')} (${reason}).`,
        undefined,
        `/dashboard/orders/${order.id}`,
      );
      await supabase.from('order_logs').insert({
        order_id: order.id,
        status: 'Refund pending',
        user_name: caller.name,
        snapshot_data: { amount: paid, reason },
      });
    }
  }

  await addOrderNote(supabase, order.id, `Cancelled: ${reason}`, caller.name);

  const { data: putBack } = await supabase
    .from('staff_tasks')
    .select('id, assignee_name')
    .eq('order_id', order.id)
    .eq('kind', 'put_back')
    .eq('status', 'open')
    .limit(1)
    .maybeSingle();

  const parts = [`${short} cancelled.`];
  if (putBack) parts.push(`Put-back task sent to ${putBack.assignee_name || 'Al, Edric'}.`);
  if (closedTasksCount > 0) parts.push(`Closed ${closedTasksCount} open task${closedTasksCount === 1 ? '' : 's'}.`);

  return {
    cancelled: true,
    outcome: parts.join(' '),
    putBackTaskCreated: !!putBack,
    putBackAssignees: (putBack?.assignee_name as string | null) || null,
    closedTasksCount,
  };
}
