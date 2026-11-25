import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isStaffUser, staffRoleNames } from '@/lib/auth/staff-roles';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import { TaskError } from '@/lib/services/staff-tasks/staff-task-service';
import { answerTask, type AnswerCaller } from '@/lib/services/staff-tasks/task-answer-service';
import type { TaskAnswer } from '@/types/staff-tasks.types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ANSWERS: TaskAnswer[] = ['ok_to_ship', 'waiting', 'cancel'];

async function getCaller(): Promise<AnswerCaller | null> {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user || !isStaffUser(user)) return null;
  const meta: Record<string, unknown> = user.user_metadata || {};
  const isManagement = isManagementUser(user);
  return {
    id: user.id,
    name: `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Staff',
    isManagement,
    canAnswer: isManagement || staffRoleNames(user).includes('Sales'),
  };
}

// { taskId, answer: 'ok_to_ship' | 'waiting' | 'cancel', note? }: the answer buttons on a task about an order.
export async function POST(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = await req.json();
    const answer = String(body.answer) as TaskAnswer;
    if (!ANSWERS.includes(answer)) return NextResponse.json({ error: 'Unknown answer' }, { status: 400 });
    const result = await answerTask(supabase, String(body.taskId || ''), caller, answer, body.note);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const status = e instanceof TaskError ? 400 : 500;
    if (status === 500) console.error('task answer:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
