import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { staffRolesOf } from '@/lib/auth/staff-roles';
import {
  handleOrderChanges,
  listOpenOrderChanges,
  recordOrderChange,
} from '@/lib/services/orders/order-change-service';
import type { OrderItemChange } from '@/types/order-changes';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function staff() {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  const roles = staffRolesOf(user);
  if (!user || roles.length === 0) return null;
  const meta = (user.user_metadata || {}) as { first_name?: string; last_name?: string };
  const name = `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Staff';
  return { name, roles };
}

function isChange(c: unknown): c is OrderItemChange {
  const x = c as OrderItemChange;
  return !!x && typeof x.product_id === 'string' && Number.isFinite(x.before) && Number.isFinite(x.after);
}

// Open "order changed" notices for the Inventory and owners' dashboards.
export async function GET() {
  try {
    if (!(await staff())) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const notices = await listOpenOrderChanges(supabase);
    return NextResponse.json({ notices });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

// After an order edit: save what changed (only kept if the order was printed or picked).
export async function POST(req: Request) {
  try {
    const me = await staff();
    if (!me) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = await req.json();
    const orderId = String(body?.orderId || '');
    const changes: OrderItemChange[] = Array.isArray(body?.changes) ? body.changes.filter(isChange) : [];
    if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    const saved = await recordOrderChange(supabase, orderId, changes, me.name);
    return NextResponse.json({ saved });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

// Reprinted / Got it: closes the order's open notices.
export async function PATCH(req: Request) {
  try {
    const me = await staff();
    if (!me) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = await req.json();
    const orderIds: string[] = Array.isArray(body?.orderIds) ? body.orderIds.map(String).filter(Boolean) : [];
    const how = body?.how;
    if (orderIds.length === 0 || !['reprinted', 'seen'].includes(how)) {
      return NextResponse.json({ error: 'Missing orderIds or how' }, { status: 400 });
    }
    const closed = await handleOrderChanges(supabase, orderIds, how, me.name);
    return NextResponse.json({ closed });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
