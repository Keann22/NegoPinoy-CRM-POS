import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  CustomerProfileError,
  generateBatchProfiles,
  generateCustomerProfile,
  getCustomerProfile,
  listCustomerProfiles,
  saveProfileFeedback,
} from '@/lib/services/customers/customer-profile-service';
import { getTaskCaller } from '@/lib/services/staff-tasks/task-caller';
import type { PersonaType, StaffProfileVerdict } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function fail(err: unknown) {
  const status = err instanceof CustomerProfileError ? 400 : 500;
  return NextResponse.json(
    { error: err instanceof Error ? err.message : String(err) },
    { status }
  );
}

export async function GET(req: Request) {
  try {
    const caller = await getTaskCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

    const params = new URL(req.url).searchParams;
    const view = params.get('view');

    if (view === 'list') {
      const result = await listCustomerProfiles(supabase, {
        persona: params.get('persona'),
        action: params.get('action'),
        todayOnly: params.get('todayOnly') === 'true',
      });
      return NextResponse.json(result);
    }

    const customerId = params.get('customerId') || undefined;
    const psid = params.get('psid') || undefined;
    if (!customerId && !psid) {
      return NextResponse.json({ error: 'customerId or psid is required' }, { status: 400 });
    }

    const result = await getCustomerProfile(supabase, { customerId, psid });
    return NextResponse.json(result);
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  try {
    const caller = await getTaskCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

    const body = (await req.json()) as {
      action?: string;
      limit?: number;
      customerId?: string;
      psid?: string;
    };

    if (body.action === 'batch') {
      const result = await generateBatchProfiles(supabase, Number(body.limit) || 5);
      return NextResponse.json(result);
    }

    if (!body.customerId && !body.psid) {
      return NextResponse.json({ error: 'customerId or psid is required' }, { status: 400 });
    }

    const result = await generateCustomerProfile(supabase, {
      customerId: body.customerId,
      psid: body.psid,
    });
    return NextResponse.json(result);
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const caller = await getTaskCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

    const body = (await req.json()) as {
      customerId?: string;
      verdict?: StaffProfileVerdict;
      personaType?: PersonaType;
      correctionNote?: string | null;
    };

    if (!body.customerId || !body.verdict) {
      return NextResponse.json(
        { error: 'customerId and verdict are required' },
        { status: 400 }
      );
    }

    const profile = await saveProfileFeedback(supabase, {
      customerId: body.customerId,
      verdict: body.verdict,
      personaType: body.personaType,
      correctionNote: body.correctionNote ?? null,
      staffName: caller.name,
    });
    return NextResponse.json({ profile });
  } catch (err) {
    return fail(err);
  }
}
