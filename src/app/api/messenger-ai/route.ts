import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  CopilotError,
  getCopilotDashboardData,
  listPopupActions,
  runThrottledAutoScan,
  scanAndAnalyzeBursts,
  searchCatalogVariants,
} from '@/lib/services/messenger-ai/messenger-copilot-service';
import { getTaskCaller } from '@/lib/services/staff-tasks/task-caller';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function fail(err: unknown) {
  const status = err instanceof CopilotError ? err.status : 500;
  return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status });
}

export async function GET(req: Request) {
  try {
    const caller = await getTaskCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

    const params = new URL(req.url).searchParams;
    const view = params.get('view') || 'popup';

    if (view === 'variants') {
      const q = params.get('q') || '';
      return NextResponse.json({ variants: await searchCatalogVariants(supabase, q) });
    }

    if (view === 'dashboard') {
      if (!caller.isManagement) return NextResponse.json({ error: 'Owners only' }, { status: 403 });
      return NextResponse.json(await getCopilotDashboardData(supabase));
    }

    await runThrottledAutoScan(supabase).catch(() => false);
    return NextResponse.json({ actions: await listPopupActions(supabase, caller) });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  try {
    const caller = await getTaskCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as {
      maxBursts?: number;
      quietSeconds?: number;
      lookbackHours?: number;
    };

    const result = await scanAndAnalyzeBursts(supabase, {
      maxBursts: body.maxBursts,
      quietSeconds: body.quietSeconds,
      lookbackHours: body.lookbackHours,
    });
    return NextResponse.json(result);
  } catch (err) {
    return fail(err);
  }
}
