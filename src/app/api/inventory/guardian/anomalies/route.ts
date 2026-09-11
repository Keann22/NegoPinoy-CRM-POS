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

export async function GET() {
  try {
    const allAnomalies = await detectInventoryAnomalies(supabase);
    const dailyProgress = await getGuardianDailyProgress(supabase, allAnomalies.length);

    // Filter out products already audited today
    const auditedProductIds = new Set(dailyProgress.completedItems.map(i => i.productId));
    const pendingAnomalies = allAnomalies.filter(a => !auditedProductIds.has(a.productId));

    // Today's 5-item queue
    const queueLimit = dailyProgress.isGoalMet ? 0 : dailyProgress.remainingToday;
    const todayQueue = pendingAnomalies.slice(0, Math.max(queueLimit, 0));

    // Asynchronously dispatch any pending Telegram alerts in background without blocking
    (async () => {
      try {
        const { notifyInventoryAnomaly, getTelegramConfig } = await import(
          '@/lib/services/inventory/inventory-guardian-telegram-service'
        );
        const config = getTelegramConfig();
        if (config.botToken && config.chatId) {
          for (const a of todayQueue) {
            if (a.severity === 'high') {
              await notifyInventoryAnomaly(supabase, a);
            }
          }
        }
      } catch (err) {
        console.error('Background Telegram alert error:', err);
      }
    })();

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
