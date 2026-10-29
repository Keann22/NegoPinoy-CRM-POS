import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestEditor } from '@/lib/services/request-editor';
import { createReceipt, listRecentReceipts } from '@/lib/services/purchase-receipt-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Snap receipt (owners only): recent receipts and the supplier list.
export async function GET() {
  try {
    const editor = await getRequestEditor();
    if (!editor?.isManagement) return NextResponse.json({ error: 'Owners only' }, { status: 403 });
    const [receipts, { data: suppliers }] = await Promise.all([
      listRecentReceipts(supabase),
      supabase.from('suppliers').select('id, name').order('name'),
    ]);
    return NextResponse.json({ receipts, suppliers: suppliers || [] });
  } catch (error: any) {
    console.error('List receipts failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to load receipts' }, { status: 500 });
  }
}

// Start a receipt; its photos are sent one by one to ./photo.
export async function POST(req: Request) {
  try {
    const editor = await getRequestEditor();
    if (!editor?.isManagement) return NextResponse.json({ error: 'Owners only' }, { status: 403 });
    const { supplierId } = await req.json();
    const id = await createReceipt(supabase, supplierId || null, editor);
    return NextResponse.json({ id });
  } catch (error: any) {
    console.error('Create receipt failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to start receipt' }, { status: 500 });
  }
}
