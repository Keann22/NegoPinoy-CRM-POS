import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { remindUnfinishedRecounts } from '@/lib/services/inventory/recount-request-service';
import { getTelegramConfig } from '@/lib/services/inventory/inventory-guardian-telegram-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * Vercel cron, every day 04:00 UTC = 12:00 PM Philippine time (vercel.json).
 * Telegrams the owner about recount batches Jas hasn't finished by their due
 * date. Safe to call again: each batch is reminded at most once a day.
 * `?check=1` only reports (Telegram configured? how many would be reminded?).
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
    }
    if (new URL(req.url).searchParams.get('check')) {
      const cfg = getTelegramConfig();
      const result = await remindUnfinishedRecounts(supabase, new Date(), true);
      return NextResponse.json({ telegramConfigured: !!(cfg.botToken && cfg.chatId), ...result });
    }
    return NextResponse.json(await remindUnfinishedRecounts(supabase));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
