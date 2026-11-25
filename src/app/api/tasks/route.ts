import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  cancelTask, createTask, getOrderContext, listAllTasks, listMyTasks, listOrderTasks, listPeople, markDone, markSeen,
  rescheduleTask, setProgress, TaskError,
} from '@/lib/services/staff-tasks/staff-task-service';
import { getTaskCaller } from '@/lib/services/staff-tasks/task-caller';
import { ackNote, createNote, listNoteTargets, listSentNotes, listUnseenNotes } from '@/lib/services/staff-tasks/staff-note-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const getCaller = getTaskCaller;

function fail(e: unknown) {
  const status = e instanceof TaskError ? 400 : 500;
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
}

// ?view=mine (default): my tasks and notes, plus the notes I sent. ?view=noteTargets&orderId=: who a note can go to.
// ?view=unseenNotes: notes nobody saw in 2 hours (owners). ?view=all: every task (owners). ?view=people: who to assign to (owners).
// ?view=order&orderId=: tasks on one order. ?view=orderContext&orderId=: hold note + customer's other open orders (owners).
export async function GET(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const params = new URL(req.url).searchParams;
    const view = params.get('view') || 'mine';
    if (view === 'mine') {
      const [tasks, sent] = await Promise.all([listMyTasks(supabase, caller.id), listSentNotes(supabase, caller.id)]);
      return NextResponse.json({ tasks, sent });
    }
    if (view === 'noteTargets') {
      return NextResponse.json({ targets: await listNoteTargets(supabase, params.get('orderId') || null, caller.id) });
    }
    if (view === 'order') {
      const orderId = params.get('orderId');
      if (!orderId) return NextResponse.json({ tasks: [] });
      return NextResponse.json({ tasks: await listOrderTasks(supabase, orderId) });
    }
    if (!caller.isManagement) return NextResponse.json({ error: 'Owners only' }, { status: 403 });
    if (view === 'unseenNotes') return NextResponse.json({ tasks: await listUnseenNotes(supabase) });
    if (view === 'people') return NextResponse.json({ people: await listPeople(supabase) });
    if (view === 'orderContext') {
      const orderId = params.get('orderId');
      return NextResponse.json({ context: orderId ? await getOrderContext(supabase, orderId) : null });
    }
    const days = Math.min(90, Math.max(1, Number(params.get('days')) || 14));
    return NextResponse.json({ tasks: await listAllTasks(supabase, days) });
  } catch (e) {
    return fail(e);
  }
}

// New task (owners): { personKeys: [...], message, orderId?, dueAt? } — one copy per person.
// Order note (any staff): { kind: 'note', targetKeys: [...], mentionNames?, message, orderId?, needsAnswer }.
export async function POST(req: Request) {
  try {
    const caller = await getCaller();
    const body = await req.json();
    if (caller && body.kind === 'note') {
      const ids = await createNote(supabase, {
        orderId: body.orderId ? String(body.orderId) : null,
        message: String(body.message || ''),
        targetKeys: Array.isArray(body.targetKeys) ? body.targetKeys.map(String) : [],
        mentionNames: Array.isArray(body.mentionNames) ? body.mentionNames.map(String) : [],
        needsAnswer: body.needsAnswer !== false,
      }, caller);
      return NextResponse.json({ ids });
    }
    if (!caller?.isManagement) return NextResponse.json({ error: 'Only the owners can assign tasks' }, { status: 403 });
    const keys: unknown[] = Array.isArray(body.personKeys) ? body.personKeys : body.personKey ? [body.personKey] : [];
    const ids = await createTask(supabase, {
      personKeys: keys.map(String),
      message: String(body.message || ''),
      orderId: body.orderId ? String(body.orderId) : null,
      dueAt: body.dueAt ? String(body.dueAt) : null,
    }, caller);
    return NextResponse.json({ ids });
  } catch (e) {
    return fail(e);
  }
}

// { id, action: 'seen' | 'working' | 'problem' | 'done' | 'cancel' | 'ack' | 'reschedule', note?, photoUrl?, dueAt? }
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
    else if (body.action === 'ack') await ackNote(supabase, id, caller);
    else if (body.action === 'reschedule') await rescheduleTask(supabase, id, caller, body.dueAt ? String(body.dueAt) : null);
    else return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
