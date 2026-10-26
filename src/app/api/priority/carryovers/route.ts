import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPriorityCaller } from '@/lib/priority/priority-auth';
import { closeCarryOvers, createCarryOvers, listOpenCarryOvers, requestBuyForCarryOvers } from '@/lib/services/carryover-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

function isMissingTable(error: any) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || /does not exist|schema cache/i.test(error?.message || '');
}

/** Open "to follow" items: ?customerId= for one customer, or all. */
export async function GET(req: Request) {
  try {
    const caller = await getPriorityCaller();
    if (!caller) return bad('Not signed in', 401);
    const customerId = new URL(req.url).searchParams.get('customerId');
    if (customerId && !UUID.test(customerId)) return bad('Invalid customer');
    try {
      return NextResponse.json({ carryOvers: await listOpenCarryOvers(supabase, customerId || undefined), ready: true });
    } catch (error) {
      if (isMissingTable(error)) return NextResponse.json({ carryOvers: [], ready: false });
      throw error;
    }
  } catch (error: any) {
    console.error('Error in carryovers GET:', error);
    return bad(error.message || 'Failed to load', 500);
  }
}

/**
 * action 'create': { orderId, items: [{ productId, productName, qty, unitPrice, unitCost, wasOs }], note? }
 *   - items removed in Edit Order that the customer still wants with their next order;
 *     wasOs = it was out of stock, so it goes back on the buy list
 * action 'close':  { ids, status: 'added' | 'cancelled', orderId? }
 *   - added to a new order, or no longer owed
 */
export async function POST(req: Request) {
  try {
    const caller = await getPriorityCaller();
    if (!caller) return bad('Not signed in', 401);
    const body = await req.json();

    if (body.action === 'create') {
      if (!caller.canDecide) return bad('Only sales and the jas accounts can add to-follow items.', 403);
      const { orderId, items, note } = body;
      if (typeof orderId !== 'string' || !UUID.test(orderId)) return bad('Invalid order');
      if (!Array.isArray(items) || items.length === 0 || items.length > 50) return bad('No items');
      const clean = items.map((i: any) => ({
        productId: String(i.productId),
        productName: String(i.productName || 'Item').slice(0, 300),
        qty: Math.floor(Number(i.qty)),
        unitPrice: Math.max(0, Number(i.unitPrice) || 0),
        unitCost: Math.max(0, Number(i.unitCost) || 0),
        wasOs: i.wasOs === true,
      }));
      if (clean.some((i) => !UUID.test(i.productId) || !(i.qty > 0))) return bad('Invalid item');

      const { data: order } = await supabase.from('orders').select('customer_id').eq('id', orderId).maybeSingle();
      if (!order?.customer_id) return bad('Order has no customer');
      const created = await createCarryOvers(supabase, { customerId: order.customer_id, fromOrderId: orderId, note, items: clean }, caller);
      const osIds = new Set(clean.filter((i) => i.wasOs).map((i) => i.productId));
      await requestBuyForCarryOvers(req.url, created.filter((c) => osIds.has(c.productId)), caller.name);
      return NextResponse.json({ ok: true, created: created.length });
    }

    if (body.action === 'close') {
      const { ids, status, orderId } = body;
      if (!Array.isArray(ids) || ids.length === 0 || ids.some((id: any) => !UUID.test(String(id)))) return bad('Invalid items');
      if (status !== 'added' && status !== 'cancelled') return bad('Invalid status');
      if (status === 'cancelled' && !caller.canDecide) return bad('Only sales and the jas accounts can cancel to-follow items.', 403);
      if (status === 'added' && (typeof orderId !== 'string' || !UUID.test(orderId))) return bad('Invalid order');
      await closeCarryOvers(supabase, { ids, status, orderId }, caller);
      return NextResponse.json({ ok: true });
    }

    return bad('Invalid action');
  } catch (error: any) {
    console.error('Error in carryovers POST:', error);
    return bad(error.message || 'Failed to save', 500);
  }
}
