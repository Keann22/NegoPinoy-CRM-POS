import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getReturnsCaller } from '@/lib/services/customer-returns/customer-return-caller';
import {
  createCustomerReturn,
  CustomerReturnError,
  getReturnableLines,
  listCustomerReturns,
  openCasesForCourierReturns,
} from '@/lib/services/customer-returns/customer-return-service';
import { applyCustomerReturnAction } from '@/lib/services/customer-returns/customer-return-actions';
import { listRtsPrompts, logReturnedParcel, searchOrdersForParcel } from '@/lib/services/customer-returns/customer-return-rts';
import type { CustomerReturnAction, NewCustomerReturn } from '@/types/customer-returns.types';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function errorResponse(e: unknown) {
  if (e instanceof CustomerReturnError) return NextResponse.json({ error: e.message }, { status: 400 });
  const message = e instanceof Error ? e.message : String(e);
  console.error('customer-returns:', message);
  return NextResponse.json({ error: message }, { status: 500 });
}

// GET            -> open cases + closed in the last 60 days
// GET ?orderId=  -> that order's lines (for opening a case)
// GET ?search=   -> orders matching an order # / customer name (logging a returned parcel)
// GET ?prompts=1 -> courier returns waiting on this person's resend / cancel answer (pop-up)
export async function GET(req: Request) {
  try {
    const caller = await getReturnsCaller();
    if (!caller?.canUse) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const params = new URL(req.url).searchParams;
    if (params.get('prompts')) return NextResponse.json({ prompts: await listRtsPrompts(supabase, caller) });
    const search = params.get('search');
    if (search != null) return NextResponse.json({ orders: await searchOrdersForParcel(supabase, search) });
    const orderId = params.get('orderId');
    if (orderId) return NextResponse.json({ lines: await getReturnableLines(supabase, orderId) });
    return NextResponse.json(await listCustomerReturns(supabase, caller.isManagement, caller.isSales, caller.isWarehouse));
  } catch (e) {
    return errorResponse(e);
  }
}

// POST NewCustomerReturn                       -> open a case
// POST { action: 'courier_rts', orderIds }     -> open RTS cases after courier sync
// POST { action: 'log_parcel', orderId, reason } -> staff have the returned parcel in hand
export async function POST(req: Request) {
  try {
    const caller = await getReturnsCaller();
    if (!caller?.canUse) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = await req.json();
    if (body?.action === 'log_parcel') {
      if (typeof body.orderId !== 'string') return NextResponse.json({ error: 'Pick the order' }, { status: 400 });
      const boxIds = Array.isArray(body.boxIds) ? body.boxIds.map(String) : [];
      return NextResponse.json(await logReturnedParcel(supabase, body.orderId, String(body.reason || ''), caller.name, boxIds));
    }
    if (body?.action === 'courier_rts') {
      const opened = await openCasesForCourierReturns(supabase, Array.isArray(body.orderIds) ? body.orderIds : [], `${caller.name} (courier sync)`);
      return NextResponse.json({ opened });
    }
    return NextResponse.json(await createCustomerReturn(supabase, body as NewCustomerReturn, caller.name));
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH CustomerReturnAction -> move a case along
export async function PATCH(req: Request) {
  try {
    const caller = await getReturnsCaller();
    if (!caller?.canUse) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    await applyCustomerReturnAction(supabase, (await req.json()) as CustomerReturnAction, caller.name, caller.isManagement, caller.isSales);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
