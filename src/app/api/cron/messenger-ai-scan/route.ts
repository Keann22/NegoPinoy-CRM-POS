import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findReadyMessageBursts } from '@/lib/services/messenger-ai/messenger-context-builder';
import { scanAndAnalyzeBursts } from '@/lib/services/messenger-ai/messenger-copilot-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Background scan endpoint for incoming Messenger chat bursts (including payment
 * screenshots). Protected by CRON_SECRET (listed under OPEN_PATHS in src/middleware.ts).
 * `?check=1` reports ready/photo counts without running AI or updating rows.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
    }

    const params = new URL(req.url).searchParams;
    const dryRun = params.get('check') === '1';
    const maxBursts = Math.min(20, Math.max(1, Number(params.get('max')) || 6));
    const quietSeconds = Math.max(0, Number(params.get('quiet')) || 60);
    const lookbackHours = Math.min(168, Math.max(1, Number(params.get('hours')) || 48));

    if (dryRun) {
      const { readyBursts, trivialLogIds } = await findReadyMessageBursts(supabase, {
        maxBursts,
        quietSeconds,
        lookbackHours,
      });
      return NextResponse.json({
        readyCount: readyBursts.length,
        trivialCount: trivialLogIds.length,
        photoCount: readyBursts.filter((b) => Boolean(b.attachmentUrl)).length,
      });
    }

    const result = await scanAndAnalyzeBursts(supabase, {
      maxBursts,
      quietSeconds,
      lookbackHours,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
