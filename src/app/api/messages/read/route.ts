import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { markThreadRead } from '@/lib/services/thread-service';

export const dynamic = 'force-dynamic';

/** Moves the caller's read marker for a thread to now. */
export async function POST(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { issueId, userId, displayName } = await req.json();
    if (!issueId || !userId) {
      return NextResponse.json({ error: 'issueId and userId are required' }, { status: 400 });
    }

    await markThreadRead(supabase, issueId, userId, displayName || 'Staff');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error marking thread read:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
