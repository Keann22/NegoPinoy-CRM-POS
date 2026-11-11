import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import { resolveHeldPickerCount } from '@/lib/services/inventory/held-picker-count-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Owners decide on a picker count that was held (higher than the shelf number).
export async function POST(req: Request) {
  try {
    const sessionClient = await createSessionClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user || !isManagementUser(user)) return NextResponse.json({ error: 'Only the owners can do this.' }, { status: 403 });
    const meta = (user.user_metadata || {}) as { first_name?: string; last_name?: string };
    const actorName = `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Owner';

    const body = await req.json();
    const id = String(body?.id || '');
    const action = body?.action;
    if (!id || !['approve', 'purchase', 'dismiss'].includes(action)) {
      return NextResponse.json({ error: 'Missing id or action' }, { status: 400 });
    }
    const held = await resolveHeldPickerCount(supabase, id, action, actorName);
    return NextResponse.json({ held });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
