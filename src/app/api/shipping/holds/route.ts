import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isStaffUser } from '@/lib/auth/staff-roles';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import {
  ShipHoldError, answerShipHold, getHoldForm, listShipHoldPrompts, releaseShipHold, setShipHold,
} from '@/lib/services/shipping/ship-hold-service';
import { SHIP_HOLD_KINDS, type ShipHoldAnswer, type ShipHoldKind, type ShipVia } from '@/types/ship-holds.types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ANSWERS: ShipHoldAnswer[] = ['release', 'not_yet', 'waiting'];

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
  if (err instanceof ShipHoldError) return NextResponse.json({ error: err.message }, { status: 400 });
  console.error('ship holds:', err);
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
}

// GET ?prompts=1      -> pop-up cards for this agent (owners: unanswered 3+ days, no agent)
// GET ?orderId=       -> hold dialog data: the order, its hold, the customer's other open orders
export async function GET(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const params = new URL(req.url).searchParams;
    if (params.get('prompts')) return NextResponse.json({ prompts: await listShipHoldPrompts(supabase, caller) });
    const orderId = params.get('orderId');
    if (orderId) return NextResponse.json({ form: await getHoldForm(supabase, orderId) });
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
  } catch (err) {
    return fail(err);
  }
}

// POST { action: 'hold', orderId, kind, note, checkOn, shipVia, withOrderIds }
// POST { action: 'release', holdId }                 -> Ready na: back to Ready to ship
// POST { action: 'answer', holdId, answer, checkOn? } -> pop-up answer
export async function POST(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = await req.json();
    if (body.action === 'hold') {
      const kind = String(body.kind) as ShipHoldKind;
      if (!SHIP_HOLD_KINDS[kind]) return NextResponse.json({ error: 'Pick a reason.' }, { status: 400 });
      await setShipHold(supabase, {
        orderId: String(body.orderId || ''),
        kind,
        note: String(body.note || ''),
        checkOn: String(body.checkOn || ''),
        shipVia: (body.shipVia === 'bus' ? 'bus' : 'courier') as ShipVia,
        withOrderIds: Array.isArray(body.withOrderIds) ? body.withOrderIds.map(String) : [],
      }, caller.name);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'release') {
      const orderIds = await releaseShipHold(supabase, String(body.holdId || ''), caller.name);
      return NextResponse.json({ ok: true, orderIds });
    }
    if (body.action === 'answer') {
      const answer = String(body.answer) as ShipHoldAnswer;
      if (!ANSWERS.includes(answer)) return NextResponse.json({ error: 'Unknown answer' }, { status: 400 });
      await answerShipHold(supabase, String(body.holdId || ''), answer, caller.name, body.checkOn ? String(body.checkOn) : undefined);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return fail(err);
  }
}
