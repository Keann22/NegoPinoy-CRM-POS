import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { refreshStaleCustomerProfiles } from '@/lib/services/customers/customer-profile-refresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Keeps customer personas continuously up to date (dirty profiles flagged by DB
 * triggers on orders/payments/chats + newly ordered unprofiled customers).
 * Protected by CRON_SECRET (listed under OPEN_PATHS in src/middleware.ts).
 * `?check=1` reports counts without modifying data.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
    }
    const params = new URL(req.url).searchParams;
    const dryRun = params.get('check') === '1';
    const limit = Math.min(40, Math.max(1, Number(params.get('limit')) || 20));
    const result = await refreshStaleCustomerProfiles(supabase, {
      limit,
      concurrency: 4,
      dryRun,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
