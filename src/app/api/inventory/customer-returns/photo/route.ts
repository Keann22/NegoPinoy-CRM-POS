import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getReturnsCaller } from '@/lib/services/customer-returns/customer-return-caller';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = 'customer-returns';
const MAX_BYTES = 10 * 1024 * 1024;

// Upload one damage photo (multipart field "file"); returns its public URL.
// Customer damage photos aren't confidential, so the bucket is public-read.
export async function POST(req: Request) {
  try {
    const caller = await getReturnsCaller();
    if (!caller?.canUse) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: 'No photo' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Photo is over 10 MB' }, { status: 400 });
    const type = file.type || 'image/jpeg';
    if (!type.startsWith('image/')) return NextResponse.json({ error: 'Only photos can be added' }, { status: 400 });
    const ext = (type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
    const month = new Date().toISOString().slice(0, 7);
    const path = `${month}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: type });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('customer-returns photo:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
