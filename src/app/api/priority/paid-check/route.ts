import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPriorityCaller } from '@/lib/priority/priority-auth';
import { checkNewlyPaid } from '@/lib/services/priority-notify-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Is this order now fully paid?" — called right after a payment is saved
 * ({ orderId }), and periodically with no body as a safety net. Notifies once per order.
 */
export async function POST(req: Request) {
  try {
    if (!(await getPriorityCaller())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const orderId = typeof body?.orderId === 'string' && UUID.test(body.orderId) ? body.orderId : undefined;
    const sent = await checkNewlyPaid(supabase, orderId);
    return NextResponse.json({ ok: true, sent });
  } catch (error: any) {
    console.error('Error in paid-check POST:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
