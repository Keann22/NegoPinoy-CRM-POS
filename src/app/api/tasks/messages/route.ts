import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TaskError } from '@/lib/services/staff-tasks/staff-task-service';
import { listTaskMessages, postTaskMessage } from '@/lib/services/staff-tasks/staff-task-messages-service';
import { getTaskCaller } from '@/lib/services/staff-tasks/task-caller';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function fail(e: unknown) {
  const status = e instanceof TaskError ? 400 : 500;
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
}

// ?taskId=: the replies on a task (marks them read for the caller's side).
export async function GET(req: Request) {
  try {
    const caller = await getTaskCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const taskId = new URL(req.url).searchParams.get('taskId') || '';
    return NextResponse.json({ messages: await listTaskMessages(supabase, taskId, caller) });
  } catch (e) {
    return fail(e);
  }
}

// { taskId, body }: a question or reply from the staff member or an owner.
export async function POST(req: Request) {
  try {
    const caller = await getTaskCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = await req.json();
    await postTaskMessage(supabase, String(body.taskId || ''), caller, String(body.body || ''));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
