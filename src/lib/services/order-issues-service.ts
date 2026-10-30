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

  if (!issues || issues.length === 0) return;

  // Expand remainingProductIds to include component product IDs for any bundle items
  const { data: prods } = await supabase
    .from('products')
    .select('id, assembly_recipe')
    .in('id', remainingProductIds);

  const allRemainingIds = new Set<string>(remainingProductIds);
  (prods || []).forEach((p: any) => {
    if (Array.isArray(p.assembly_recipe)) {
      p.assembly_recipe.forEach((comp: any) => {
        const cId = comp.productId || comp.component_id;
        if (cId) allRemainingIds.add(cId);
      });
    }
  });

  const issuesToResolve = (issues as any[]).filter(i => i.product_id && !allRemainingIds.has(i.product_id));

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

/**
 * Statuses where a picker has already gone through the order. Lines on these
 * orders without an open issue are treated as picked everywhere (unallocated
 * stock, Need to Buy, Guardian shelf counts).
 */
export const STATUSES_AFTER_PICKING: string[] = [
  'Picked', 'Picked (with issue)', 'Photo', 'Packed', 'For Shipping', 'For Pick-up',
];

type QtyLine = { productId: string; quantity: number };

/**
 * When an edit adds items (or raises a quantity) on an order that was already
 * picked, the added pieces were never picked. Without an open issue the system
 * would treat them as picked (real case 2026-10-20: a hanger swapped onto a
 * Picked (with issue) order, then a shelf count saved its stock 2 too high).
 *
 * Opens an issue for each added piece so they count as "not picked yet", and
 * returns true if anything was flagged (the caller moves the order to
 * Picked (with issue) so the warehouse picks them). Bundles are flagged on their
 * components, the same way the picker reports bundle shortages.
 */
export async function flagItemsAddedAfterPicking(
  supabase: SupabaseClient,
  orderId: string,
  originalItems: QtyLine[],
  newItems: QtyLine[],
  actorName: string
): Promise<boolean> {
  const sumByProduct = (items: QtyLine[]) => {
    const m = new Map<string, number>();
    items.forEach((i) => m.set(i.productId, (m.get(i.productId) || 0) + (Number(i.quantity) || 0)));
    return m;
  };
  const before = sumByProduct(originalItems);
  const added = new Map<string, number>();
  sumByProduct(newItems).forEach((qty, productId) => {
    const extra = qty - (before.get(productId) || 0);
    if (extra > 0) added.set(productId, extra);
  });
  if (added.size === 0) return false;

  // Explode bundles onto their components.
  const { data: prods, error: prodErr } = await supabase
    .from('products')
    .select('id, name, assembly_recipe')
    .in('id', Array.from(added.keys()));
  if (prodErr) throw prodErr;
  const perProduct = new Map<string, number>();
  const addQty = (id: string, q: number) => perProduct.set(id, (perProduct.get(id) || 0) + q);
  added.forEach((qty, productId) => {
    const p = (prods || []).find((x: any) => x.id === productId);
    const recipe = Array.isArray(p?.assembly_recipe) ? p.assembly_recipe : [];
    if (recipe.length === 0) return addQty(productId, qty);
    recipe.forEach((c: any) => {
      const cId = c.productId || c.component_id;
      if (cId) addQty(cId, qty * (Number(c.quantity) || 1));
    });
  });

  // Add onto an issue that is already open for the same product, instead of a second one.
  const { data: openIssues } = await supabase
    .from('order_issues')
    .select('id, product_id, out_of_stock_qty')
    .eq('order_id', orderId)
    .eq('status', 'open')
    .in('product_id', Array.from(perProduct.keys()));

  for (const [productId, qty] of Array.from(perProduct.entries())) {
    const existing = (openIssues || []).find((i: any) => i.product_id === productId);
    let issueId: string | null = null;
    if (existing) {
      const { error } = await supabase
        .from('order_issues')
        .update({ out_of_stock_qty: (Number(existing.out_of_stock_qty) || 0) + qty })
        .eq('id', existing.id);
      if (error) throw error;
      issueId = existing.id;
    } else {
      const { data, error } = await supabase
        .from('order_issues')
        .insert({
          order_id: orderId,
          product_id: productId,
          status: 'open',
          reported_by_name: actorName,
          out_of_stock_qty: qty,
        })
        .select('id')
        .single();
      if (error) throw error;
      issueId = data?.id ?? null;
    }
    if (issueId) {
      await supabase.from('order_issue_messages').insert({
        issue_id: issueId,
        sender_role: 'sales',
        sender_name: actorName,
        message: `${qty} pc(s) added to the order after it was picked. Not picked yet; please pick.`,
      });
    }
  }
  return true;
}
