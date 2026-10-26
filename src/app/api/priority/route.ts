import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { getPriorityList } from '@/lib/services/priority-list-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** The ranked priority list (see priority-rules.ts). Signed-in staff only. */
export async function GET() {
  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const result = await getPriorityList(supabase);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in priority GET:', error);
    return NextResponse.json({ error: error.message || 'Failed to load priority list' }, { status: 500 });
  }
}
