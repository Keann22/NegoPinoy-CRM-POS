import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import { actorNameFor, getPoTracking, updatePoTracking } from '@/lib/services/online-order-tracking-service';
import { addLinesToPurchaseOrder } from '@/lib/services/procurement-purchase-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Online-order shipments on the Procurement Sheet (Owner/Admin only, same as the sheet).
async function getManagementCaller() {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  return isManagementUser(user) ? user : null;
}

const forbidden = () => NextResponse.json({ error: 'Only an admin can use the Procurement Sheet.' }, { status: 403 });

export async function GET(req: Request) {
  try {
    if (!(await getManagementCaller())) return forbidden();
    const poId = new URL(req.url).searchParams.get('poId');
    if (!poId) return NextResponse.json({ error: 'Missing poId' }, { status: 400 });
    return NextResponse.json(await getPoTracking(supabase, poId));
  } catch (error: any) {
    console.error('Error in procurement tracking GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getManagementCaller();
    if (!user) return forbidden();
    const { poId, route, platformOrderNo, trackingNo, stage, expectedArrival, note } = await req.json();
    if (!poId) return NextResponse.json({ error: 'Missing poId' }, { status: 400 });
    await updatePoTracking(
      supabase,
      poId,
      { route, platformOrderNo, trackingNo, stage, expectedArrival, note },
      actorNameFor(user)
    );
    return NextResponse.json(await getPoTracking(supabase, poId));
  } catch (error: any) {
    console.error('Error in procurement tracking PATCH:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Add items to an already-recorded purchase. Qty / price changes and removals
// go through /api/inventory/procurement/day-purchases (editPurchaseLine).
export async function POST(req: Request) {
  try {
    if (!(await getManagementCaller())) return forbidden();
    const { poId, lines } = await req.json();
    if (!poId) return NextResponse.json({ error: 'Missing poId' }, { status: 400 });
    await addLinesToPurchaseOrder(supabase, poId, lines);
    return NextResponse.json(await getPoTracking(supabase, poId));
  } catch (error: any) {
    console.error('Error in procurement tracking POST:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
