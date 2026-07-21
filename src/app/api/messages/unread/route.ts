import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { countUnread } from '@/lib/services/thread-service';

export const dynamic = 'force-dynamic';

/** Lightweight total-unread count for the floating message button badge. */
export async function GET(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const userName = searchParams.get('userName') || '';
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const { data: myRows, error: myErr } = await supabase
      .from('thread_participants')
      .select('issue_id, last_read_at')
      .eq('user_id', userId);
    if (myErr) throw myErr;

    if (!myRows || myRows.length === 0) {
      return NextResponse.json({ totalUnread: 0 });
    }

    const lastReadByThread = new Map(myRows.map((r) => [r.issue_id, r.last_read_at]));
    const oldestMarker = myRows
      .map((r) => r.last_read_at)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];

    const { data: messages, error: msgErr } = await supabase
      .from('order_issue_messages')
      .select('issue_id, sender_name, created_at')
      .in('issue_id', myRows.map((r) => r.issue_id))
      .gt('created_at', oldestMarker);
    if (msgErr) throw msgErr;

    let totalUnread = 0;
    const byThread = new Map<string, { sender_name: string | null; created_at: string }[]>();
    for (const m of messages || []) {
      byThread.set(m.issue_id, [...(byThread.get(m.issue_id) || []), m]);
    }
    for (const [issueId, msgs] of byThread) {
      totalUnread += countUnread(msgs, lastReadByThread.get(issueId), userName);
    }

    return NextResponse.json({ totalUnread });
  } catch (error: any) {
    console.error('Error fetching unread count:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
