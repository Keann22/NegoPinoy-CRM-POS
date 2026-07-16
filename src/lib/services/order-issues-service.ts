import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Statuses that only happen after picking has succeeded (cleanly or via a fix).
 * An order can't reach any of these while still short a product, so any
 * still-open order_issues tied to it are stale and should auto-clear.
 */
export const STATUSES_THAT_CLEAR_ORDER_ISSUES: string[] = [
  'Picked', 'Photo', 'Packed', 'For Shipping', 'For Pick-up',
  'Shipped', 'Completed', 'Payment Received (COD)', 'Cancelled', 'Returned'
];

/**
 * Records a resolved order_issues row into order_logs so it shows up in the Order
 * Trail — otherwise resolution is invisible: order_issues.status just flips with
 * no timestamp, actor, or reason for it ever being recorded anywhere.
 */
async function logIssueResolution(
  supabase: SupabaseClient,
  orderId: string,
  productName: string | null,
  actorName: string
): Promise<void> {
  await supabase.from('order_logs').insert({
    order_id: orderId,
    status: 'Issue Resolved',
    user_name: actorName,
    snapshot_data: productName ? { productName } : null,
  });
}

/**
 * Resolves any still-open order_issues for an order. Call this whenever an
 * order's status moves to one of STATUSES_THAT_CLEAR_ORDER_ISSUES through any
 * path (Packer app, Mark Shipped, manual status dropdown, bulk status change),
 * not just the one flow that originally reported the issue — otherwise the
 * Order Issues dashboard keeps showing tickets for orders that already shipped.
 *
 * `logResolution` defaults to true (a genuine resolution worth recording in the
 * Order Trail). Pass false for the one case where this isn't really a resolution —
 * usePicker.ts clears stale issues before a re-pick attempt even when the re-pick
 * is still partial, so logging "Issue Resolved" there would misleadingly claim the
 * item was fixed when it may still be missing (a fresh issue gets reported right
 * after, if so).
 */
export async function resolveOpenOrderIssues(
  supabase: SupabaseClient,
  orderId: string,
  actorName: string = 'System',
  logResolution: boolean = true
): Promise<void> {
  const { data: issues } = await supabase
    .from('order_issues')
    .select('id, product_id, products(name)')
    .eq('order_id', orderId)
    .eq('status', 'open');

  await supabase
    .from('order_issues')
    .update({ status: 'resolved' })
    .eq('order_id', orderId)
    .eq('status', 'open');

  if (!logResolution) return;

  for (const issue of (issues || []) as any[]) {
    await logIssueResolution(supabase, orderId, issue.products?.name || null, actorName);
  }
}

/**
 * Resolves open order_issues for products that were removed from the order
 * during an edit. Issues with no product_id (e.g. order-level On-Hold issues)
 * aren't tied to a specific item, so they're left alone here.
 */
export async function resolveOrderIssuesForRemovedProducts(
  supabase: SupabaseClient,
  orderId: string,
  remainingProductIds: string[],
  actorName: string = 'System'
): Promise<void> {
  const { data: issues } = await supabase
    .from('order_issues')
    .select('id, product_id, products(name)')
    .eq('order_id', orderId)
    .eq('status', 'open');

  if (!issues) return;

  const issuesToResolve = (issues as any[]).filter(i => i.product_id && !remainingProductIds.includes(i.product_id));

  for (const issue of issuesToResolve) {
    await supabase.from('order_issues').update({ status: 'resolved' }).eq('id', issue.id);
    await logIssueResolution(supabase, orderId, issue.products?.name || null, actorName);
  }
}

/**
 * Creates an order-level On-Hold issue if one doesn't already exist.
 */
export async function createOnHoldIssue(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  const { data: existingIssue } = await supabase
    .from('order_issues')
    .select('id')
    .eq('order_id', orderId)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle();

  if (!existingIssue) {
    const { data: newIssue } = await supabase
      .from('order_issues')
      .insert({
        order_id: orderId,
        status: 'open',
        reported_by_name: 'System (Auto)'
      })
      .select('id')
      .single();
    
    if (newIssue) {
      await supabase.from('order_issue_messages').insert({
        issue_id: newIssue.id,
        sender_role: 'sales',
        sender_name: 'System',
        message: 'Order was placed On-Hold manually. Please review.'
      });
    }
  }
}
