import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import {
  buildDiscrepancyItems,
  canSeeSource,
  discrepancyAccess,
  loadDiscrepancySources,
  serviceClient,
} from '@/lib/services/payments/payment-discrepancy-service';
import type { DiscrepancyListResponse } from '@/types/payment-discrepancy.types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = discrepancyAccess(user);
    const supabase = serviceClient();
    const sources = (await loadDiscrepancySources(supabase)).filter((s) => canSeeSource(s, access));
    const items = await buildDiscrepancyItems(supabase, sources);

    const body: DiscrepancyListResponse = {
      items,
      currentUser: { id: access.userId, name: access.name, isManagement: access.isManagement },
    };
    return NextResponse.json(body);
  } catch (error: unknown) {
    console.error('Error fetching payment discrepancies:', error);
    const message = error instanceof Error ? error.message : 'Failed to load discrepancies';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
