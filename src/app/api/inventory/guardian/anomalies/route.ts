import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  detectInventoryAnomalies,
  applyPhysicalShelfCount,
  backfillUnrecordedPurchase,
  markStockAsBorrowed
} from '@/lib/services/inventory/inventory-guardian-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const anomalies = await detectInventoryAnomalies(supabase);
    return NextResponse.json({ success: true, anomalies });
  } catch (error: any) {
    console.error('Error fetching inventory anomalies:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, payload } = body;

    if (!action || !payload || !payload.productId) {
      return NextResponse.json({ success: false, error: 'Missing action or payload parameters' }, { status: 400 });
    }

    if (action === 'set_physical_count') {
      const result = await applyPhysicalShelfCount(supabase, {
        productId: payload.productId,
        physicalShelfCount: Number(payload.physicalShelfCount),
        notes: payload.notes,
        actorName: payload.actorName
      });
      return NextResponse.json(result);
    }

    if (action === 'backfill_purchase') {
      const result = await backfillUnrecordedPurchase(supabase, {
        productId: payload.productId,
        quantity: Number(payload.quantity),
        unitCost: Number(payload.unitCost) || 0,
        supplierName: payload.supplierName,
        purchaseDate: payload.purchaseDate,
        actorName: payload.actorName
      });
      return NextResponse.json(result);
    }

    if (action === 'borrow_stock') {
      const result = await markStockAsBorrowed(supabase, {
        productId: payload.productId,
        quantity: Number(payload.quantity),
        orderId: payload.orderId,
        notes: payload.notes,
        actorName: payload.actorName
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error('Error processing guardian anomaly action:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
