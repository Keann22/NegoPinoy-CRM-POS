import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTaskCaller } from '@/lib/services/staff-tasks/task-caller';
import { getReadyToPickOrders } from '@/lib/services/inventory/ready-to-pick-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Live list of Picked (with issue) and Processing orders fillable from warehouse shelf stock. */
export async function GET() {
  try {
    const caller = await getTaskCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const data = await getReadyToPickOrders(supabase);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
