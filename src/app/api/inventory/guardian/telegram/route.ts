import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getTelegramConfig,
  testTelegramConnection,
  notifyInventoryAnomaly
} from '@/lib/services/inventory/inventory-guardian-telegram-service';
import { detectInventoryAnomalies } from '@/lib/services/inventory/inventory-guardian-service';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  const config = getTelegramConfig();
  return NextResponse.json({
    configured: Boolean(config.botToken && config.chatId),
    hasBotToken: Boolean(config.botToken),
    hasChatId: Boolean(config.chatId)
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, botToken, chatId } = body;

    // 1. Test connection action
    if (action === 'test') {
      const customConfig = (botToken && chatId) ? { botToken, chatId } : undefined;
      const result = await testTelegramConnection(customConfig);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: 'Test message sent to Telegram successfully!' });
    }

    // 2. Dispatch alerts action
    if (action === 'dispatch_alerts') {
      const anomalies = await detectInventoryAnomalies(supabase);

      const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://pos.negopinoy.com';
      let sentCount = 0;

      for (const anomaly of anomalies) {
        // Only notify high or medium severity anomalies
        if (anomaly.severity === 'high' || anomaly.severity === 'medium') {
          const res = await notifyInventoryAnomaly(supabase, anomaly, origin);
          if (res.sent) sentCount++;
        }
      }

      return NextResponse.json({
        success: true,
        totalAnomalies: anomalies.length,
        sentCount
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('Error in guardian telegram route:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal error' }, { status: 500 });
  }
}
