import type { SupabaseClient } from '@supabase/supabase-js';
import { parse, isValid } from 'date-fns';

export type OrderTrailEntryKind = 'status' | 'note' | 'issue_reported' | 'issue_message';

export interface OrderTrailEntry {
  id: string;
  kind: OrderTrailEntryKind;
  title: string;
  detail?: string;
  actor?: string;
  createdAt: string;
}

/**
 * order.notes entries are appended as "[MMM d, yyyy h:mm a] Sender Name:\nmessage"
 * (see handleSendNote in overdue-order-dialog.tsx), separated by blank lines. Splits
 * them into individual dated entries instead of one opaque blob.
 */
function parseNoteEntries(notes: string | null | undefined, fallbackDate: string): OrderTrailEntry[] {
  if (!notes || !notes.trim()) return [];

  return notes
    .split('\n\n')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((entry, idx) => {
      const match = entry.match(/^\[(.+?)\]\s*(.+?):\s*([\s\S]*)$/);
      if (match) {
        const parsedDate = parse(match[1].trim(), 'MMM d, yyyy h:mm a', new Date());
        return {
          id: `note_${idx}`,
          kind: 'note' as const,
          title: 'Note',
          detail: match[3].trim(),
          actor: match[2].trim(),
          createdAt: isValid(parsedDate) ? parsedDate.toISOString() : fallbackDate,
        };
      }
      return {
        id: `note_${idx}`,
        kind: 'note' as const,
        title: 'Note',
        detail: entry,
        createdAt: fallbackDate,
      };
    });
}

/**
 * Builds the full, merged history for one order — status changes (order_logs),
 * freeform staff notes (orders.notes), and stock-issue reports + discussion
 * (order_issues / order_issue_messages) — sorted newest first. This is the single
 * source of truth for "everything that's ever happened on this order," used by
 * both OrderTrailDialog (order detail page) and the Overdue Order dialog.
 *
 * order_issues/messages go through the API route (not a direct client query) to
 * match the rest of the codebase — nothing else reads that table client-side,
 * so its RLS posture relative to the service-role-only route is unconfirmed.
 */
export async function fetchOrderTrail(supabase: SupabaseClient, orderId: string): Promise<OrderTrailEntry[]> {
  const [logsRes, orderRes, issuesRes] = await Promise.all([
    supabase.from('order_logs').select('*').eq('order_id', orderId).order('created_at', { ascending: false }),
    supabase.from('orders').select('created_at, sales_person_name, notes').eq('id', orderId).single(),
    fetch(`/api/inventory/issues?orderId=${orderId}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);

  const entries: OrderTrailEntry[] = [];

  (logsRes.data || []).forEach((log: any) => {
    let detail: string | undefined;
    if (log.snapshot_data?.reason) detail = log.snapshot_data.reason;
    else if (log.snapshot_data?.productName) detail = log.snapshot_data.productName;

    entries.push({
      id: log.id,
      kind: 'status',
      title: log.status,
      detail,
      actor: log.user_name || undefined,
      createdAt: log.created_at,
    });
  });

  const orderData = orderRes.data;

  if (orderData) {
    const hasOrderPlacedLog = entries.some((e) => e.title === 'Order Placed' || e.title === 'Order Created');
    if (!hasOrderPlacedLog) {
      entries.push({
        id: 'initial_order_creation',
        kind: 'status',
        title: 'Order Placed',
        actor: orderData.sales_person_name || 'System / Customer',
        createdAt: orderData.created_at,
      });
    }

    entries.push(...parseNoteEntries(orderData.notes, orderData.created_at));
  }

  (issuesRes || []).forEach((issue: any) => {
    const productName = issue.products?.name;
    entries.push({
      id: `issue_${issue.id}`,
      kind: 'issue_reported',
      title: productName ? `Stock Issue Reported: ${productName}` : 'Issue Reported',
      actor: issue.reported_by_name || undefined,
      createdAt: issue.created_at,
    });

    (issue.order_issue_messages || []).forEach((msg: any) => {
      entries.push({
        id: `issue_msg_${msg.id}`,
        kind: 'issue_message',
        title: 'Issue Discussion',
        detail: msg.message,
        actor: msg.sender_name || (msg.sender_role === 'sales' ? 'Sales' : 'Picker'),
        createdAt: msg.created_at,
      });
    });
  });

  entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return entries;
}
