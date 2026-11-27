import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CopilotError, reviewCopilotAction } from '@/lib/services/messenger-ai/messenger-copilot-service';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isStaffUser, staffRoleNames } from '@/lib/auth/staff-roles';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import type { ExecutorCaller } from '@/lib/services/messenger-ai/messenger-action-executor';
import type { CopilotActionPayload, MessengerAiErrorCategory, MessengerAiVerdict } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Signed-in staff member; canCancel matches /api/orders/cancel (Sales or owners). */
async function getCaller(): Promise<ExecutorCaller | null> {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user || !isStaffUser(user)) return null;
  const meta: Record<string, unknown> = user.user_metadata || {};
  const isManagement = isManagementUser(user);
  return {
    id: user.id,
    name: `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Staff',
    isManagement,
    canCancel: isManagement || staffRoleNames(user).includes('Sales'),
  };
}

export async function POST(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

    const body = (await req.json()) as {
      actionId?: string;
      verdict?: MessengerAiVerdict;
      finalPayload?: CopilotActionPayload;
      errorCategory?: MessengerAiErrorCategory | null;
      staffNote?: string | null;
    };

    if (!body.actionId || !body.verdict) {
      return NextResponse.json({ error: 'actionId and verdict are required.' }, { status: 400 });
    }
    if (!['correct', 'edited', 'rejected'].includes(body.verdict)) {
      return NextResponse.json({ error: 'Invalid verdict.' }, { status: 400 });
    }

    const result = await reviewCopilotAction(supabase, {
      actionId: body.actionId,
      verdict: body.verdict,
      finalPayload: body.finalPayload,
      errorCategory: body.errorCategory ?? null,
      staffNote: body.staffNote ?? null,
      caller,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const status = err instanceof CopilotError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}
