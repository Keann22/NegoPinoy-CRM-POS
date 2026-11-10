import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isStaffUser } from '@/lib/auth/staff-roles';
import { serviceClient } from '@/lib/services/payments/payment-discrepancy-service';
import {
  StoreCreditError,
  applyStoreCredit,
  getCustomerCreditInfo,
} from '@/lib/services/payments/store-credit-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getCaller() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user || !isStaffUser(user)) return null;
  const meta = (user.user_metadata || {}) as { first_name?: string; last_name?: string };
  return {
    id: user.id,
    name: `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Staff',
  };
}

function fail(err: unknown) {
  if (err instanceof StoreCreditError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Store credit payment error:', err);
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
}

/** GET ?orderId=... : returns customer store credit and order balance info */
export async function GET(request: Request) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const orderId = new URL(request.url).searchParams.get('orderId');
    if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });

    const info = await getCustomerCreditInfo(serviceClient(), orderId);
    return NextResponse.json(info);
  } catch (err) {
    return fail(err);
  }
}

/** POST { orderId, amount, note? } : applies store credit to the order */
export async function POST(request: Request) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const body = await request.json();
    const { orderId, amount, note } = body;

    const result = await applyStoreCredit(serviceClient(), {
      orderId,
      amount: Number(amount),
      actorName: caller.name,
      note,
    });

    return NextResponse.json(result);
  } catch (err) {
    return fail(err);
  }
}
