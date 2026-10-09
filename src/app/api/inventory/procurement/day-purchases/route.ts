import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import {
  fetchPurchasesInRange,
  isManagementUser,
  editPurchaseLine,
  removePurchaseLine,
  type PurchaseLineEdit,
} from '@/lib/services/purchase-summary-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getSessionUser() {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  return user;
}

// What was bought in a date range, for the Procurement Sheet's "Today's
// Purchases" summary. Lighter than /api/reports/purchases, which also builds
// the all-time uncosted-receipts backlog.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    if (!start || !end) {
      return NextResponse.json({ error: 'Missing start/end parameters' }, { status: 400 });
    }

    const purchases = await fetchPurchasesInRange(supabase, start, end);
    const isManagement = isManagementUser(await getSessionUser());

    // Strip supplier names and costs server-side for non-management callers so
    // they never reach the browser.
    if (!isManagement) {
      return NextResponse.json({
        isManagement: false,
        suppliers: [],
        purchases: purchases.map(p => ({ ...p, supplierId: null, supplierName: null, unitCost: 0, totalCost: 0 })),
      });
    }

    const { data: suppliers } = await supabase.from('suppliers').select('id, name').order('name');
    return NextResponse.json({ isManagement: true, suppliers: suppliers || [], purchases });
  } catch (error: any) {
    console.error('Error in day-purchases GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const { itemId, qty, unitCost, supplierId } = await req.json();
    if (!itemId) return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });

    const edit: PurchaseLineEdit = {};
    if (qty !== undefined && qty !== null && qty !== '') edit.qty = Number(qty);
    if (isManagementUser(user)) {
      if (unitCost !== undefined && unitCost !== null && unitCost !== '') edit.unitCost = Number(unitCost);
      if (supplierId !== undefined) edit.supplierId = supplierId || null;
    }

    const result = await editPurchaseLine(supabase, itemId, edit);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error in day-purchases PATCH:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const itemId = new URL(req.url).searchParams.get('itemId');
    if (!itemId) return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });

    await removePurchaseLine(supabase, itemId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in day-purchases DELETE:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
