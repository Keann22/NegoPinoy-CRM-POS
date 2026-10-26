import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPriorityCaller } from '@/lib/priority/priority-auth';
import { addPriorityEvent } from '@/lib/services/priority-list-service';
import { createCarryOvers, orderLinePrice, requestBuyForCarryOvers } from '@/lib/services/carryover-service';
import { OS_DECISIONS, type OsDecision } from '@/lib/priority/priority-rules';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Does this order already have a buy request for this product that hasn't fully arrived? */
async function hasOpenBuyRequest(orderId: string, productId: string): Promise<boolean> {
  const { data } = await supabase
    .from('procurement_request_sources')
    .select('purchase_order_items!inner(product_id, expected_qty, received_qty, status)')
    .eq('order_id', orderId)
    .eq('purchase_order_items.product_id', productId);
  return (data || []).some((s: any) => {
    const poi = s.purchase_order_items;
    return poi && poi.status !== 'received' && Number(poi.received_qty || 0) < Number(poi.expected_qty || 0);
  });
}

/** Same call the picker makes on an OS scan, linked to this order. */
async function requestBuy(req: Request, productId: string, qty: number, orderId: string, byName: string) {
  const res = await fetch(new URL('/api/inventory/procurement-request', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ productId, requestedQty: qty, orderId }], requestedByName: byName }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Decision saved, but the buy request failed: ${data.error || res.statusText}`);
  }
}

/**
 * Sales' decision on an out-of-stock item.
 * Body: { orderId, productId, decision: 'wait' | 'carry_over' | 'remove', note? }
 *  - wait: makes sure there is a buy request for this order (lay-aways included)
 *  - carry_over: records the item as "to follow" on the customer and requests it
 *    to be bought; sales then removes it from this order (Edit order)
 *  - remove: sales removes it from the order (Edit order)
 */
export async function POST(req: Request) {
  try {
    const caller = await getPriorityCaller();
    if (!caller) return bad('Not signed in', 401);
    if (!caller.canDecide) return bad('Only sales and the jas accounts can decide on OS items.', 403);

    const { orderId, productId, decision, note } = await req.json();
    const cleanNote = typeof note === 'string' ? note.trim().slice(0, 500) : '';
    if (typeof orderId !== 'string' || !UUID.test(orderId)) return bad('Invalid order');
    if (typeof productId !== 'string' || !UUID.test(productId)) return bad('Invalid item');
    if (!(decision in OS_DECISIONS)) return bad('Pick a decision');
    if (decision !== 'wait' && cleanNote.length < 2) return bad('Add what the customer agreed to.');

    const { data: order } = await supabase.from('orders').select('id, customer_id').eq('id', orderId).maybeSingle();
    if (!order) return bad('Order not found', 404);

    const { data: issue } = await supabase
      .from('order_issues')
      .select('out_of_stock_qty')
      .eq('order_id', orderId)
      .eq('product_id', productId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const line = await orderLinePrice(supabase, orderId, productId);
    const qty = Number(issue?.out_of_stock_qty || line?.qty || 1);

    if (decision === 'carry_over') {
      // A part of a set can't be taken off the order on its own.
      if (!line) return bad('This item is part of a set, so it can\'t follow on its own. Choose "Customer will wait" or remove the set.');
      if (!order.customer_id) return bad('This order has no customer, so the item has nobody to follow to.');
    }

    await addPriorityEvent(supabase, { orderId, kind: 'os_decision', productId, reasonCode: decision as OsDecision, note: cleanNote }, caller);

    if (decision === 'wait' && !(await hasOpenBuyRequest(orderId, productId))) {
      await requestBuy(req, productId, qty, orderId, caller.name);
    }

    if (decision === 'carry_over' && line) {
      const created = await createCarryOvers(supabase, {
        customerId: order.customer_id,
        fromOrderId: orderId,
        note: cleanNote,
        items: [{ productId, productName: line.productName, qty, unitPrice: line.unitPrice, unitCost: line.unitCost }],
      }, caller);
      // The customer still wants it, just with the next order: keep it on the buy list.
      // (Only when newly recorded, so changing the decision twice doesn't double the request.)
      await requestBuyForCarryOvers(req.url, created, caller.name);
    }

    return NextResponse.json({ ok: true, needsEdit: decision !== 'wait' });
  } catch (error: any) {
    console.error('Error in priority decision POST:', error);
    return bad(error.message || 'Failed to save', 500);
  }
}
