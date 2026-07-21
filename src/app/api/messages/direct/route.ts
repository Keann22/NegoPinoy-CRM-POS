import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Finds or creates the 1:1 direct thread between two staff members.
 * Direct threads are order_issues rows with issue_type 'direct' and no
 * order/product, so they share the message pipeline, realtime channel, and
 * read tracking with issue threads.
 */
export async function POST(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { userId, userName, otherUserId, otherUserName } = await req.json();
    if (!userId || !otherUserId || userId === otherUserId) {
      return NextResponse.json({ error: 'Two distinct user ids are required' }, { status: 400 });
    }

    // Existing DM = a direct thread where I'm a member whose member set is exactly the pair
    const { data: myRows, error: myErr } = await supabase
      .from('thread_participants')
      .select('issue_id, order_issues!inner(issue_type)')
      .eq('user_id', userId)
      .eq('is_member', true)
      .eq('order_issues.issue_type', 'direct');
    if (myErr) throw myErr;

    const myThreadIds = (myRows || []).map((r) => r.issue_id);
    if (myThreadIds.length > 0) {
      const { data: allRows, error: allErr } = await supabase
        .from('thread_participants')
        .select('issue_id, user_id')
        .in('issue_id', myThreadIds)
        .eq('is_member', true);
      if (allErr) throw allErr;

      const byThread = new Map<string, string[]>();
      for (const r of allRows || []) {
        byThread.set(r.issue_id, [...(byThread.get(r.issue_id) || []), r.user_id]);
      }
      for (const [issueId, ids] of byThread) {
        if (ids.length === 2 && ids.includes(otherUserId)) {
          return NextResponse.json({ issueId, created: false });
        }
      }
    }

    const { data: issue, error: issueErr } = await supabase
      .from('order_issues')
      .insert({
        issue_type: 'direct',
        status: 'open',
        reported_by_name: userName || 'Staff',
      })
      .select('id')
      .single();
    if (issueErr) throw issueErr;

    const now = new Date().toISOString();
    const { error: partErr } = await supabase.from('thread_participants').insert([
      { issue_id: issue.id, user_id: userId, display_name: userName || 'Staff', is_member: true, last_read_at: now },
      { issue_id: issue.id, user_id: otherUserId, display_name: otherUserName || 'Staff', is_member: true, last_read_at: now },
    ]);
    if (partErr) throw partErr;

    return NextResponse.json({ issueId: issue.id, created: true });
  } catch (error: any) {
    console.error('Error creating direct thread:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
