import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getProcurementDashboardData } from '@/lib/services/procurement-dashboard-service';
import { processProcurementPurchases, updateProductSupplierPricing, setSupplierProductCode } from '@/lib/services/procurement-purchase-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const data = await getProcurementDashboardData(supabase);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error in procurement GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
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
    const { productId, newSupplierId, unitCost, supplierCode } = await req.json();
    if (!productId || !newSupplierId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }
    // Code-only request (from the receipt scanner): just learn the supplier's
    // product code without reassigning the product's supplier.
    if (supplierCode !== undefined && unitCost === undefined) {
      await setSupplierProductCode(supabase, productId, newSupplierId, supplierCode);
    } else {
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
