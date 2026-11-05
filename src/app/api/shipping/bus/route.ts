import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isStaffUser } from '@/lib/auth/staff-roles';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import { busOrdersForOrder, searchBusOrders } from '@/lib/services/shipping/bus-order-search';
import { BusShipmentError, saveBusShipment } from '@/lib/services/shipping/bus-shipment-service';
import { answerBusSfPrompt, listBusSfPrompts, listBusTrips } from '@/lib/services/shipping/bus-shipment-queries';
import type { BusSfAnswer, SaveBusShipmentInput } from '@/types/bus-shipping.types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ANSWERS: BusSfAnswer[] = ['waiting', 'keep_credit', 'tip', 'refund'];

async function getCaller() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user || !isStaffUser(user)) return null;
  const meta = (user.user_metadata || {}) as { first_name?: string; last_name?: string };
  return {
    name: `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Staff',
    isManagement: isManagementUser(user),
  };
}

function fail(err: unknown) {
  if (err instanceof BusShipmentError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error('bus shipping:', err);
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
}

// GET ?search=   -> a customer's orders that can go on the bus (order # or name)
// GET ?orderId=  -> that order's customer and their orders
// GET ?trips=1   -> every recorded trip (Bus Rates)
// GET ?prompts=1 -> trips where this agent must collect SF / decide about extra (pop-up)
export async function GET(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const params = new URL(req.url).searchParams;
    if (params.get('prompts')) return NextResponse.json({ prompts: await listBusSfPrompts(supabase, caller) });
    if (params.get('trips')) return NextResponse.json({ trips: await listBusTrips(supabase) });
    const orderId = params.get('orderId');
    if (orderId) return NextResponse.json({ orders: await busOrdersForOrder(supabase, orderId) });
    return NextResponse.json({ orders: await searchBusOrders(supabase, params.get('search') || '') });
  } catch (err) {
    return fail(err);
  }
}

// POST SaveBusShipmentInput                -> record a bus trip
// POST { action: 'answer', id, answer }    -> the agent's answer on the pop-up
export async function POST(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = await req.json();
    if (body?.action === 'answer') {
      if (typeof body.id !== 'string' || !ANSWERS.includes(body.answer)) {
        return NextResponse.json({ error: 'Bad answer' }, { status: 400 });
      }
      await answerBusSfPrompt(supabase, body.id, body.answer, caller.name);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(await saveBusShipment(supabase, body as SaveBusShipmentInput, caller.name));
  } catch (err) {
    return fail(err);
  }
}
