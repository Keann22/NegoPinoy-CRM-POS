import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { listReceipts, correctReceipt, editorFromUser } from '@/lib/services/receipt-correction-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getEditor() {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  return editorFromUser(user);
}

const todayPht = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

// Receipts made from Bulk Receive on one PHT day ("Received today"). Staff see
// today only; admins can pick any day.
export async function GET(req: Request) {
  try {
    const editor = await getEditor();
    if (!editor) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const requested = searchParams.get('day');
    const day = editor.isManagement && requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : todayPht();

    const start = new Date(`${day}T00:00:00+08:00`).toISOString();
    const end = new Date(`${day}T23:59:59.999+08:00`).toISOString();
    const { receipts, undone } = await listReceipts(supabase, start, end, editor);

    return NextResponse.json({ day, isManagement: editor.isManagement, receipts, undone });
  } catch (error: any) {
    console.error('Error listing receipts:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Correct one receipt's quantity (0 = undo it). Permission is checked in the
// service: the person who received it on the same day until an admin has
// checked it, otherwise Owner/Admin only.
export async function POST(req: Request) {
  try {
    const editor = await getEditor();
    if (!editor) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

    const { movementId, newQty, note } = await req.json();
    if (!movementId || newQty === undefined || newQty === null || newQty === '') {
      return NextResponse.json({ error: 'Missing receipt or quantity.' }, { status: 400 });
    }

    const result = await correctReceipt(
      supabase,
      String(movementId),
      Number(newQty),
      String(note || '').trim().slice(0, 300),
      editor,
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error correcting receipt:', error);
    // Permission/validation messages are written for staff; show them as-is.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
