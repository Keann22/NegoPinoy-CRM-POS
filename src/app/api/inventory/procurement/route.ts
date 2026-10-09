import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { getProcurementDashboardData } from '@/lib/services/procurement-dashboard-service';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import { processProcurementPurchases, updateProductSupplierPricing, setSupplierProductCode } from '@/lib/services/procurement-purchase-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// The Procurement Sheet is built around supplier names and purchase costs,
// which are management-only. Everything here is closed to other accounts
// except the negative-stock list the Stock Reconciliation report reads.
async function callerIsManagement() {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  return isManagementUser(user);
}

const forbidden = () => NextResponse.json({ error: 'Only an admin can use the Procurement Sheet.' }, { status: 403 });

export async function GET() {
  try {
    const data = await getProcurementDashboardData(supabase);
    if (!(await callerIsManagement())) {
      return NextResponse.json({
        suppliers: [],
        groupedOutofStock: [],
        purchasedItems: [],
        reconciliationItems: data.reconciliationItems,
      });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error in procurement GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!(await callerIsManagement())) return forbidden();
    const { purchases } = await req.json();
    const poId = await processProcurementPurchases(supabase, purchases);
    return NextResponse.json({ success: true, poId });
  } catch (error: any) {
    console.error('Error in procurement POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    if (!(await callerIsManagement())) return forbidden();
    const { productId, newSupplierId, unitCost, supplierCode } = await req.json();
    if (!productId) {
      return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
    }
    // Code-only request (with or without supplier specified)
    if (supplierCode !== undefined && (unitCost === undefined || !newSupplierId)) {
      await setSupplierProductCode(supabase, productId, newSupplierId || null, supplierCode);
      if (newSupplierId && unitCost !== undefined) {
        await updateProductSupplierPricing(supabase, productId, newSupplierId, unitCost);
      }
    } else if (newSupplierId) {
      await updateProductSupplierPricing(supabase, productId, newSupplierId, unitCost);
      if (supplierCode !== undefined) {
        await setSupplierProductCode(supabase, productId, newSupplierId, supplierCode);
      }
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in procurement PATCH:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (!(await callerIsManagement())) return forbidden();
    const { searchParams } = new URL(req.url);
    const draftItemId = searchParams.get('draftItemId');

    if (!draftItemId) {
      return NextResponse.json({ error: 'Missing draftItemId' }, { status: 400 });
    }

    const { error } = await supabase.from('purchase_order_items').delete().eq('id', draftItemId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in procurement DELETE:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
