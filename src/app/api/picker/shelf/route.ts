import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { getOrderPickedQty, getOrdersWaitingFor, getProductsWithPendingDelivery, getShelfForProducts, savePickerShelfCount, syncUnit2AfterPick } from '@/lib/services/inventory/picker-shelf-guard-service';
import { staffRolesOf } from '@/lib/auth/staff-roles';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import { getReservations, logReservationOverride, reservationsToJson } from '@/lib/services/inventory/reservation-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const INVENTORY_ROLES = ['owner', 'admin', 'inventory', 'inventory staff', 'inventory_staff', 'inventory-staff', 'staff'];

async function getCaller() {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;
  const meta: any = user.user_metadata || {};
  const roles = staffRolesOf(user);
  if (!roles.some((r) => INVENTORY_ROLES.includes(r))) return null;
  return { name: `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Picker', isManagement: isManagementUser(user) };
}

// Shelf numbers (unallocated, Unit 2 reserve) for the products on the order being picked,
// plus how much of each the order has already picked.
export async function GET(req: Request) {
  try {
    if (!(await getCaller())) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const params = new URL(req.url).searchParams;
    const ids = (params.get('productIds') || '').split(',').filter(Boolean);
    const orderId = params.get('orderId');
    // Found fewer than the order needs: which other orders still need this product?
    const waitingFor = params.get('waitingFor');
    if (waitingFor) return NextResponse.json({ orders: await getOrdersWaitingFor(supabase, waitingFor, orderId) });
    const [shelf, picked, pending, reserved] = await Promise.all([
      getShelfForProducts(supabase, ids),
      orderId ? getOrderPickedQty(supabase, orderId) : Promise.resolve({}),
      getProductsWithPendingDelivery(supabase, ids),
      // Pieces other orders reserved for a replacement (this order's own reservation doesn't count against it).
      getReservations(supabase, { productIds: ids, excludeOrderId: orderId }),
    ]);
    // pendingDelivery: a recorded purchase of it is still waiting on Receiving (no qty: the count stays blind).
    return NextResponse.json({ shelf, picked, pendingDelivery: Array.from(pending), reserved: reservationsToJson(reserved) });
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
    // After a pick: move what Unit 2 has above the whole shelf to Unit 1 (pieces were taken from Unit 2).
    if (body?.syncUnit2) {
      const ids = Array.isArray(body.productIds) ? body.productIds.map(String) : [];
      const moved = await syncUnit2AfterPick(supabase, ids, body.orderId ? String(body.orderId) : null, caller.name);
      return NextResponse.json({ moved });
    }
    if (!body?.productId) return NextResponse.json({ error: 'Missing product' }, { status: 400 });
    // Owner gives a piece reserved for a replacement to this order instead (reason required).
    if (body.reserveOverride) {
      if (!caller.isManagement) return NextResponse.json({ error: 'Only the owners can give a reserved piece to another order.' }, { status: 403 });
      const reason = String(body.reason || '').trim().slice(0, 300);
      if (reason.length < 3) return NextResponse.json({ error: 'Add why it goes to this order.' }, { status: 400 });
      if (!body.orderId) return NextResponse.json({ error: 'Missing order' }, { status: 400 });
      const productId = String(body.productId);
      const res = (await getReservations(supabase, { productIds: [productId], excludeOrderId: body.orderId })).get(productId);
      const { data: product } = await supabase.from('products').select('name').eq('id', productId).maybeSingle();
      if (res) {
        await logReservationOverride(supabase, {
          productName: product?.name || 'item', toOrderId: String(body.orderId), reason, byName: caller.name, reserved: res.orders,
        });
      }
      return NextResponse.json({ ok: true });
    }
    const result = await savePickerShelfCount(supabase, {
      productId: String(body.productId),
      unit1Count: body.unit1Count,
      bothEmpty: !!body.bothEmpty,
      unit2Empty: !!body.unit2Empty,
      orderId: body.orderId || null,
      actorName: caller.name,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
