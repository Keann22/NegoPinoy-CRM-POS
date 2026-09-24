import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  detectInventoryAnomalies,
  getGuardianDailyProgress,
  applyPhysicalShelfCount,
  backfillUnrecordedPurchase,
  markStockAsBorrowed
} from '@/lib/services/inventory/inventory-guardian-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userEmail = searchParams.get('userEmail')?.toLowerCase().trim();
    const userName = searchParams.get('userName')?.trim();
    const userId = searchParams.get('userId')?.trim();
    const isReySpecialAssignment = userEmail === 'rey.magbitangjr@gmail.com';

    const allAnomalies = await detectInventoryAnomalies(supabase);
    const dailyProgress = await getGuardianDailyProgress(supabase, allAnomalies.length, {
      email: userEmail,
      name: userName,
      userId
    });

    // Rey's 30-item temporary shelf check assignment for today
    if (isReySpecialAssignment) {
      dailyProgress.target = 30;
      dailyProgress.baseTarget = 30;
      dailyProgress.remainingToday = Math.max(0, 30 - dailyProgress.completedToday);
      dailyProgress.isGoalMet = dailyProgress.completedToday >= 30;
    }

    // Filter out products already audited today by ANY staff to prevent redundant double checks
    const allAuditedSet = new Set(
      dailyProgress.allAuditedProductIdsToday || dailyProgress.completedItems.map(i => i.productId)
    );
    const pendingAnomalies = allAnomalies.filter(a => !allAuditedSet.has(a.productId));

    // Today's queue: if user's goal is met, queue is 0; otherwise provide up to remainingToday items
    const queueLimit = dailyProgress.isGoalMet ? 0 : dailyProgress.remainingToday;
    const todayQueue = pendingAnomalies.slice(0, Math.max(queueLimit, 0));

    return NextResponse.json({
      success: true,
      anomalies: todayQueue,
      allAnomalies: pendingAnomalies,
      dailyProgress
    });
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
        actorName: payload.actorName,
        actorId: payload.actorId
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
        actorName: payload.actorName,
        actorId: payload.actorId
      });
      return NextResponse.json(result);
    }

    if (action === 'borrow_stock') {
      const result = await markStockAsBorrowed(supabase, {
        productId: payload.productId,
        quantity: Number(payload.quantity),
        orderId: payload.orderId,
        notes: payload.notes,
        actorName: payload.actorName,
        actorId: payload.actorId
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error('Error processing guardian anomaly action:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
