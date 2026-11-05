import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isStaffUser } from '@/lib/auth/staff-roles';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = 'bus-receipts';
const MAX_BYTES = 10 * 1024 * 1024;

// Upload a photo of the bus company's receipt (multipart field "file"); returns its public URL.
// Bus fees aren't confidential (owner, 2026-11-05), so the bucket is public-read.
export async function POST(req: Request) {
  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user || !isStaffUser(user)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
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
    console.error('bus receipt photo:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
