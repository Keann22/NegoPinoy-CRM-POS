import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { staffRolesOf } from '@/lib/auth/staff-roles';
import { getStaffActivity } from '@/lib/services/inventory/staff-activity-service';
import type { ActivityCategory, ActivityDatePreset } from '@/types';

export const dynamic = 'force-dynamic';

const VALID_PRESETS = new Set<ActivityDatePreset>(['today', 'yesterday', '7d', '30d', 'custom']);
const VALID_CATEGORIES = new Set<ActivityCategory>([
  'picking',
  'checking',
  'packing',
  'receiving',
  'counting',
  'transfers',
  'returns',
  'tasks',
  'shipping',
]);

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const sessionClient = await createSessionClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const roles = staffRolesOf(user);
    if (roles.length === 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isManagement = roles.includes('owner') || roles.includes('admin');
    const isInventory = roles.includes('inventory');
    if (!isManagement && !isInventory) {
      return NextResponse.json(
        { error: 'Activity history is only available to Inventory and Management staff.' },
        { status: 403 }
      );
    }

    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const fullName = `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Staff';

    const { searchParams } = new URL(req.url);
    const rawPreset = searchParams.get('preset') as ActivityDatePreset | null;
    const preset: ActivityDatePreset = rawPreset && VALID_PRESETS.has(rawPreset) ? rawPreset : 'today';

    const rawCategory = searchParams.get('category') as ActivityCategory | 'all' | null;
    const category =
      rawCategory === 'all' || (rawCategory && VALID_CATEGORIES.has(rawCategory))
        ? rawCategory
        : 'all';

    // Non-management callers are always isolated to their own activity.
    const personKey = isManagement ? searchParams.get('personKey') : 'me';

    const result = await getStaffActivity(
      serviceClient,
      {
        userId: user.id,
        email: user.email || '',
        fullName,
        isManagement,
      },
      {
        preset,
        from: searchParams.get('from'),
        to: searchParams.get('to'),
        personKey,
        category,
        search: searchParams.get('search'),
        limit: Number(searchParams.get('limit')) || 50,
        offset: Number(searchParams.get('offset')) || 0,
      }
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error('Error fetching inventory staff activity:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load activity' },
      { status: 500 }
    );
  }
}
