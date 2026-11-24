import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isStaffUser } from '@/lib/auth/staff-roles';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import {
  PickSkipError, answerPickSkip, createPickSkip, getDeferredPicks, listPickQuestions,
} from '@/lib/services/shipping/pick-skip-service';
import { PICK_SKIP_REASONS, type PickSkipAnswer, type PickSkipReason } from '@/types/pick-skips.types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ANSWERS: PickSkipAnswer[] = ['pick_now', 'waiting'];

async function getCaller() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user || !isStaffUser(user)) return null;
  const meta = (user.user_metadata || {}) as { first_name?: string; last_name?: string };
  return {
    name: `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Staff',
    isManagement: isManagementUser(user),
  };
}

function fail(err: unknown) {
  if (err instanceof PickSkipError) return NextResponse.json({ error: err.message }, { status: 400 });
  console.error('pick skips:', err);
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
}

// GET ?prompts=1          -> "Hindi pa ipi-pick" questions for this agent (owners: 3+ days, no agent)
// GET ?pickCheck=orderId  -> { deferral } when the order ships later and is too early to pick
export async function GET(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const params = new URL(req.url).searchParams;
    if (params.get('prompts')) return NextResponse.json({ questions: await listPickQuestions(supabase, caller) });
    const orderId = params.get('pickCheck');
    if (orderId) return NextResponse.json({ deferral: (await getDeferredPicks(supabase, [orderId])).get(orderId) || null });
    return NextResponse.json({ error: 'Missing parameter' }, { status: 400 });
  } catch (err) {
    return fail(err);
  }
}

// POST { action: 'skip', orderId, reason, note }  -> warehouse: not picked yet, and why
// POST { action: 'answer', id, answer }           -> sales: pick it now / asked customer, waiting
export async function POST(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = await req.json();
    if (body.action === 'skip') {
      const reason = String(body.reason) as PickSkipReason;
      if (!PICK_SKIP_REASONS[reason]) return NextResponse.json({ error: 'Pick a reason.' }, { status: 400 });
      await createPickSkip(supabase, { orderId: String(body.orderId || ''), reason, note: String(body.note || '') }, caller.name);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'answer') {
      const answer = String(body.answer) as PickSkipAnswer;
      if (!ANSWERS.includes(answer)) return NextResponse.json({ error: 'Unknown answer' }, { status: 400 });
      await answerPickSkip(supabase, String(body.id || ''), answer, caller.name);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return fail(err);
  }
}
