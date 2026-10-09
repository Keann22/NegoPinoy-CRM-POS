import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import {
  fetchPurchasesInRange,
  fetchReceivedComparison,
  recordReceiptAsPurchase,
  confirmReceipt,
  isManagementUser,
  editPurchaseLine,
  removePurchaseLine,
  NEEDS_CHECK,
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

// What was bought and what was received in a date range, for the Procurement
// Sheet's "Today's Purchases" popup. Lighter than /api/reports/purchases, which
// also builds the all-time uncosted-receipts backlog.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    if (!start || !end) {
      return NextResponse.json({ error: 'Missing start/end parameters' }, { status: 400 });
    }

    const purchases = await fetchPurchasesInRange(supabase, start, end);

    // Just the number for the badge on the sheet's button - skips the
    // per-product supplier/cost suggestions, which are the slow part.
    if (searchParams.get('countOnly')) {
      const rows = await fetchReceivedComparison(supabase, start, end, purchases, false);
      return NextResponse.json({ toCheck: rows.filter(r => NEEDS_CHECK.includes(r.kind)).length });
    }

    const isManagement = isManagementUser(await getSessionUser());
    const received = await fetchReceivedComparison(supabase, start, end, purchases, isManagement);

    // Strip supplier names and costs server-side for non-management callers so
    // they never reach the browser.
    if (!isManagement) {
      const blank = { supplierId: null, supplierName: null, unitCost: 0 };
      return NextResponse.json({
        isManagement: false,
        suppliers: [],
        purchases: purchases.map(p => ({ ...p, ...blank, totalCost: 0 })),
        received: received.map(r => ({ ...r, ...blank })),
      });
    }

    const { data: suppliers } = await supabase.from('suppliers').select('id, name').order('name');
    return NextResponse.json({ isManagement: true, suppliers: suppliers || [], purchases, received });
  } catch (error: any) {
    console.error('Error in day-purchases GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Record an unexpected receipt as a purchase. Needs a supplier and a cost, so
// it is management-only.
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!isManagementUser(user)) {
      return NextResponse.json({ error: 'Only an admin can record a purchase with supplier and cost.' }, { status: 403 });
    }

    const { movementId, supplierId, unitCost, boughtQty } = await req.json();
    if (!movementId) return NextResponse.json({ error: 'Missing movementId' }, { status: 400 });

    const bought = boughtQty === undefined || boughtQty === null || boughtQty === '' ? null : Number(boughtQty);
    await recordReceiptAsPurchase(supabase, movementId, supplierId || null, Number(unitCost), bought);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in day-purchases POST:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const isManagement = isManagementUser(user);

    const { itemId, qty, unitCost, supplierId, confirmMovementId } = await req.json();
    if (!itemId) return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });

    const edit: PurchaseLineEdit = {};
    if (qty !== undefined && qty !== null && qty !== '') edit.qty = Number(qty);
    if (isManagement) {
      if (unitCost !== undefined && unitCost !== null && unitCost !== '') edit.unitCost = Number(unitCost);
      if (supplierId !== undefined) edit.supplierId = supplierId || null;
    }

    const result = await editPurchaseLine(supabase, itemId, edit, isManagement);
    // Checking an auto-created purchase against the supplier's receipt.
    if (confirmMovementId && isManagement) await confirmReceipt(supabase, confirmMovementId);

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
