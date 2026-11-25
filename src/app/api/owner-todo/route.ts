import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTaskCaller } from '@/lib/services/staff-tasks/task-caller';
import { getOwnerTodo, recordOwnerUpload } from '@/lib/services/owner-todo/owner-todo-service';
import { listOpenHeldPickerCounts } from '@/lib/services/inventory/held-picker-count-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Owner to-do (owners only). GET: the list. GET ?view=held: picker counts waiting for a decision.
export async function GET(req: Request) {
  try {
    const caller = await getTaskCaller();
    if (!caller?.isManagement) return NextResponse.json({ error: 'Owners only' }, { status: 403 });
    if (new URL(req.url).searchParams.get('view') === 'held') {
      return NextResponse.json({ held: await listOpenHeldPickerCounts(supabase) });
    }
    return NextResponse.json(await getOwnerTodo(supabase));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// An SPX remittance file was uploaded: { kind: 'spx_remittance', matched?, fileName? }.
export async function POST(req: Request) {
  try {
    const caller = await getTaskCaller();
    if (!caller?.isManagement) return NextResponse.json({ error: 'Owners only' }, { status: 403 });
    const body = await req.json();
    if (body.kind !== 'spx_remittance') return NextResponse.json({ error: 'Unknown upload' }, { status: 400 });
    await recordOwnerUpload(supabase, {
      kind: 'spx_remittance',
      byName: caller.name,
      matched: Number.isFinite(Number(body.matched)) ? Number(body.matched) : null,
      fileName: body.fileName ? String(body.fileName) : null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
