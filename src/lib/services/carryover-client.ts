import type { SupabaseClient } from '@supabase/supabase-js';
import type { CarryOver } from './carryover-service';

/**
 * Browser-side helpers the order form uses around saving, so "to follow"
 * items are recorded and closed without touching the order save itself.
 * Failures are reported to the caller but never undo the saved order.
 */

/** Products with an open OS issue on this order (checked before an edit resolves them). */
export async function openOsProductIds(supabase: SupabaseClient, orderId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('order_issues')
    .select('product_id')
    .eq('order_id', orderId)
    .eq('issue_type', 'order')
    .eq('status', 'open');
  return new Set((data || []).map((i: any) => i.product_id).filter(Boolean));
}

/** After a new order is saved: mark the to-follow items it now includes as added. */
export async function closeAddedCarryOvers(
  added: CarryOver[],
  orderItems: { productId: string }[],
  newOrderId: string
): Promise<void> {
  const ids = added.filter((c) => orderItems.some((i) => i.productId === c.productId)).map((c) => c.id);
  if (ids.length === 0) return;
  const res = await fetch('/api/priority/carryovers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'close', ids, status: 'added', orderId: newOrderId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not update the to-follow list');
}

/** After an edit is saved: record ticked removed/reduced items as to follow. */
export async function recordToFollow(
  orderId: string,
  originalItems: any[],
  newItems: { productId: string; quantity: number }[],
  selected: Record<string, boolean>,
  osProductIds: Set<string>
): Promise<void> {
  const now = new Map<string, number>();
  newItems.forEach((i) => now.set(i.productId, (now.get(i.productId) || 0) + Number(i.quantity || 0)));

  const items = originalItems
    .filter((o: any) => selected[o.productId])
    .map((o: any) => ({
      productId: o.productId,
      productName: o.productName || 'Item',
      qty: Number(o.quantity || 0) - (now.get(o.productId) || 0),
      unitPrice: Math.max(0, Number(o.sellingPriceAtSale || 0) - Number(o.discount || 0)),
      unitCost: Number(o.costPriceAtSale || 0),
      wasOs: osProductIds.has(o.productId),
    }))
    .filter((i) => i.qty > 0);
  if (items.length === 0) return;

  const res = await fetch('/api/priority/carryovers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', orderId, items }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save the to-follow items');
}
