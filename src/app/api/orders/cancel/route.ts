import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isStaffUser, staffRoleNames } from '@/lib/auth/staff-roles';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import {
  cancelOrder,
  OrderCancelError,
  type CancelOrderCaller,
  type PaidCancelDisposition,
} from '@/lib/services/orders/order-cancel-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function getCaller(): Promise<CancelOrderCaller | null> {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user || !isStaffUser(user)) return null;
  const meta: Record<string, unknown> = user.user_metadata || {};
  const isManagement = isManagementUser(user);
  return {
    id: user.id,
    name: `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Staff',
    isManagement,
    canCancel: isManagement || staffRoleNames(user).includes('Sales'),
  };
}

export async function POST(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = await req.json();
    const result = await cancelOrder(
      supabase,
      {
        orderId: String(body.orderId || ''),
        reason: String(body.reason || ''),
        paidDisposition: body.paidDisposition as PaidCancelDisposition | undefined,
        source: body.source ? String(body.source) : 'app',
      },
      caller,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const status = e instanceof OrderCancelError ? e.status : 500;
    if (status === 500) console.error('order cancel error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
