import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { getOrderPickedQty, getShelfForProducts, savePickerShelfCount } from '@/lib/services/inventory/picker-shelf-guard-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const INVENTORY_ROLES = ['owner', 'admin', 'inventory', 'inventory staff', 'inventory_staff', 'inventory-staff', 'staff'];

async function getCaller() {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;
  const meta: any = user.user_metadata || {};
  const roles: string[] = Array.isArray(meta.roles)
    ? meta.roles.map((r: string) => String(r).toLowerCase().trim())
    : meta.role ? [String(meta.role).toLowerCase().trim()] : [];
  if (!roles.some((r) => INVENTORY_ROLES.includes(r))) return null;
  return { name: `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Picker' };
}

// Shelf numbers (unallocated, Unit 2 reserve) for the products on the order being picked,
// plus how much of each the order has already picked.
export async function GET(req: Request) {
  try {
    if (!(await getCaller())) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const params = new URL(req.url).searchParams;
    const ids = (params.get('productIds') || '').split(',').filter(Boolean);
    const orderId = params.get('orderId');
    const [shelf, picked] = await Promise.all([
      getShelfForProducts(supabase, ids),
      orderId ? getOrderPickedQty(supabase, orderId) : Promise.resolve({}),
    ]);
    return NextResponse.json({ shelf, picked });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// Save a count made while picking (or "Unit 1 and Unit 2 are both empty" before borrowing).
export async function POST(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = await req.json();
    if (!body?.productId) return NextResponse.json({ error: 'Missing product' }, { status: 400 });
    const result = await savePickerShelfCount(supabase, {
      productId: String(body.productId),
      unit1Count: body.unit1Count,
      bothEmpty: !!body.bothEmpty,
      orderId: body.orderId || null,
      actorName: caller.name,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
