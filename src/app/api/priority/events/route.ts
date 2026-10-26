import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { editorFromUser } from '@/lib/services/receipt-correction-service';
import { addPriorityEvent } from '@/lib/services/priority-list-service';
import { phtDate } from '@/lib/priority/priority-rules';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['followup', 'hold', 'hold_cleared'] as const;

/**
 * Logs a customer follow-up, or sets / clears a "customer asked to hold" date.
 * Body: { orderId, kind, note?, holdUntil? (YYYY-MM-DD, hold only) }.
 * Who did it comes from the session, not the body.
 */
export async function POST(req: Request) {
  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    const editor = editorFromUser(user);
    if (!editor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const { orderId, kind, note, holdUntil } = await req.json();
    const cleanNote = typeof note === 'string' ? note.trim().slice(0, 500) : '';

    if (typeof orderId !== 'string' || !UUID.test(orderId)) {
      return NextResponse.json({ error: 'Invalid order' }, { status: 400 });
    }
    if (!KINDS.includes(kind)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    if (kind === 'followup' && cleanNote.length < 2) {
      return NextResponse.json({ error: 'Add a short note about the follow-up (e.g. "asked on live").' }, { status: 400 });
    }
    if (kind === 'hold') {
      if (typeof holdUntil !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(holdUntil)) {
        return NextResponse.json({ error: 'Pick the date the order should come back.' }, { status: 400 });
      }
      if (holdUntil < phtDate(new Date())) {
        return NextResponse.json({ error: 'The hold date is already past.' }, { status: 400 });
      }
      if (cleanNote.length < 2) {
        return NextResponse.json({ error: 'Add why the customer asked to hold.' }, { status: 400 });
      }
    }

    const { data: order } = await supabase.from('orders').select('id').eq('id', orderId).maybeSingle();
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    await addPriorityEvent(supabase, { orderId, kind, note: cleanNote, holdUntil }, { id: editor.id, name: editor.name });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error in priority events POST:', error);
    return NextResponse.json({ error: error.message || 'Failed to save' }, { status: 500 });
  }
}
