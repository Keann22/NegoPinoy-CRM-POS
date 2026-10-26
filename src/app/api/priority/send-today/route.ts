import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { getSendTodayList } from '@/lib/services/priority-list-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** Orders that must be booked today, for the warehouse reminder pop-up. */
export async function GET() {
  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const rows = await getSendTodayList(supabase);
    return NextResponse.json({ rows, generatedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('Error in send-today GET:', error);
    return NextResponse.json({ error: error.message || 'Failed to load' }, { status: 500 });
  }
}
