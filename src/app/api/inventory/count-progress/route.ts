import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isStaffUser } from '@/lib/auth/staff-roles';
import { getInventoryCountProgress } from '@/lib/services/inventory/inventory-count-progress-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const sessionClient = await createSessionClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();

    if (!user || !isStaffUser(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const days = Math.min(60, Math.max(1, Number(searchParams.get('days')) || 14));

    const progress = await getInventoryCountProgress(supabase, days);
    return NextResponse.json(progress);
  } catch (err) {
    console.error('Error fetching inventory count progress:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
