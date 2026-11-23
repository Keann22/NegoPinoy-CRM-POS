import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isStaffUser } from '@/lib/auth/staff-roles';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import {
  cancelTask, createTask, listAllTasks, listMyTasks, listOrderTasks, listPeople, markDone, markSeen, setProgress,
  TaskError, type TaskCaller,
} from '@/lib/services/staff-tasks/staff-task-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function getCaller(): Promise<TaskCaller | null> {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user || !isStaffUser(user)) return null;
  const meta: Record<string, unknown> = user.user_metadata || {};
  return {
    id: user.id,
    name: `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Staff',
    isManagement: isManagementUser(user),
  };
}

function fail(e: unknown) {
  const status = e instanceof TaskError ? 400 : 500;
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
}

// ?view=mine (default): my tasks. ?view=all: every task (owners). ?view=people: who to assign to (owners).
// ?view=order&orderId=: tasks on one order.
export async function GET(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const params = new URL(req.url).searchParams;
    const view = params.get('view') || 'mine';
    if (view === 'mine') return NextResponse.json({ tasks: await listMyTasks(supabase, caller.id) });
    if (view === 'order') {
      const orderId = params.get('orderId');
      if (!orderId) return NextResponse.json({ tasks: [] });
      return NextResponse.json({ tasks: await listOrderTasks(supabase, orderId) });
    }
    if (!caller.isManagement) return NextResponse.json({ error: 'Owners only' }, { status: 403 });
    if (view === 'people') return NextResponse.json({ people: await listPeople(supabase) });
    const days = Math.min(90, Math.max(1, Number(params.get('days')) || 14));
    return NextResponse.json({ tasks: await listAllTasks(supabase, days) });
  } catch (e) {
    return fail(e);
  }
}

// New task (owners): { personKey, message, orderId?, dueAt? }
export async function POST(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller?.isManagement) return NextResponse.json({ error: 'Only the owners can assign tasks' }, { status: 403 });
    const body = await req.json();
    const id = await createTask(supabase, {
      personKey: String(body.personKey || ''),
      message: String(body.message || ''),
      orderId: body.orderId ? String(body.orderId) : null,
      dueAt: body.dueAt ? String(body.dueAt) : null,
    }, caller);
    return NextResponse.json({ id });
  } catch (e) {
    return fail(e);
  }
}

// { id, action: 'seen' | 'working' | 'problem' | 'done' | 'cancel', note?, photoUrl? }
export async function PATCH(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = await req.json();
    const id = String(body.id || '');
    if (body.action === 'seen') await markSeen(supabase, id, caller);
    else if (body.action === 'working' || body.action === 'problem') await setProgress(supabase, id, caller, body.action, body.note);
    else if (body.action === 'done') await markDone(supabase, id, caller, { note: body.note, photoUrl: body.photoUrl });
    else if (body.action === 'cancel') await cancelTask(supabase, id, caller);
    else return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
