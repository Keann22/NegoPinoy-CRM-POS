import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import { completeRecount, isRecountAssignee, listOpenRecounts, RecountError } from '@/lib/services/inventory/recount-request-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function getCaller() {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;
  const meta: any = user.user_metadata || {};
  return {
    name: `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Jas',
    isAssignee: isRecountAssignee(user.email),
    isManagement: isManagementUser(user),
  };
}

// Open recount requests, for the sticky pop-up on Jas's accounts. Everyone else gets none.
export async function GET() {
  try {
    const caller = await getCaller();
    if (!caller?.isAssignee) return NextResponse.json({ requests: [] });
    return NextResponse.json({ requests: await listOpenRecounts(supabase) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// Save one product's count: { id, unit1, unit2 }.
export async function POST(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller || !(caller.isAssignee || caller.isManagement)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = await req.json();
    await completeRecount(supabase, { id: String(body.id), unit1: body.unit1, unit2: body.unit2, actorName: caller.name });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof RecountError ? 400 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
