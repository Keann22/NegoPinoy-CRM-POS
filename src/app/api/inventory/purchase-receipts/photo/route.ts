import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestEditor } from '@/lib/services/request-editor';
import { processReceiptPhoto } from '@/lib/services/purchase-receipt-service';

export const dynamic = 'force-dynamic';
// Reading a receipt with the AI reader can take a while.
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// One receipt photo: stored privately, read, sure lines recorded as purchases.
export async function POST(req: Request) {
  try {
    const editor = await getRequestEditor();
    if (!editor?.isManagement) return NextResponse.json({ error: 'Owners only' }, { status: 403 });
    const { receiptId, imageBase64 } = await req.json();
    if (!receiptId || !imageBase64) return NextResponse.json({ error: 'Missing photo' }, { status: 400 });
    const result = await processReceiptPhoto(supabase, { receiptId, imageBase64, editor });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Receipt photo failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to read the receipt' }, { status: 500 });
  }
}
