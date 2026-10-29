import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestEditor } from '@/lib/services/request-editor';
import { listLinesToMatch, resolveLine, type LineAction } from '@/lib/services/purchase-receipt-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACTIONS: LineAction[] = ['product', 'not_product', 'not_in_list'];

// Receipt lines the reader wasn't sure about. Item text only, for staff to
// match while unpacking.
export async function GET() {
  try {
    const editor = await getRequestEditor();
    if (!editor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    return NextResponse.json({ lines: await listLinesToMatch(supabase) });
  } catch (error: any) {
    console.error('List receipt lines failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to load' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const editor = await getRequestEditor();
    if (!editor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const { lineId, action, productId } = await req.json();
    if (!lineId || !ACTIONS.includes(action)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    await resolveLine(supabase, { lineId, action, productId, editor });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Resolve receipt line failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to save' }, { status: 400 });
  }
}
