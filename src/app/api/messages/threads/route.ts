import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { countUnread } from '@/lib/services/thread-service';

export const dynamic = 'force-dynamic';

/**
 * Thread list for the messaging center. Returns every order/issue thread
 * (open ones plus a capped recent-resolved archive — same visibility model as
 * the Inbox Drawer, where all staff can see all issues) and only the direct
 * threads the requesting user is a member of, each with the caller's unread
 * count derived from their thread_participants read marker.
 */
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

    // Two id sets, unioned, so an old-but-active thread is never dropped by the
    // recent-issues cap: (1) every thread the caller participates in — their DMs
    // especially, which are long-lived and reused, so their issue `created_at`
    // is old while activity is fresh; (2) the 200 most-recently-created issues
    // for the team-wide order/issue view. Ordering by `created_at` alone with a
    // flat limit used to hide any DM thread created more than 200 issues ago.
    const { data: myParts, error: partsErr } = await supabase
      .from('thread_participants')
      .select('issue_id')
      .eq('user_id', userId);
    if (partsErr) throw partsErr;
    const myIssueIds = (myParts || []).map((r) => r.issue_id);

    const { data: recent, error: recentErr } = await supabase
      .from('order_issues')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(200);
    if (recentErr) throw recentErr;
    const recentIds = (recent || []).map((r) => r.id);

    const allIds = [...new Set([...myIssueIds, ...recentIds])];
    if (allIds.length === 0) {
      return NextResponse.json({ threads: [], totalUnread: 0 });
    }

    const { data, error } = await supabase
      .from('order_issues')
      .select(`
        id, issue_type, status, order_id, product_id, po_id, reported_by_name, created_at,
        products(name),
        orders(id, status, customers(full_name)),
        purchase_orders(id, notes),
        order_issue_messages(id, sender_role, sender_name, message, created_at, requires_attention, mentions),
        thread_participants(user_id, display_name, is_member, last_read_at)
      `)
      .in('id', allIds);

    if (error) throw error;

    const threads = (data || [])
      .filter((issue: any) => {
        if (issue.issue_type !== 'direct') return true;
        return (issue.thread_participants || []).some(
          (p: any) => p.user_id === userId && p.is_member
        );
      })
      .map((issue: any) => {
        const messages = [...(issue.order_issue_messages || [])].sort(
          (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const myRow = (issue.thread_participants || []).find((p: any) => p.user_id === userId);
        const members = (issue.thread_participants || []).filter((p: any) => p.is_member);
        const lastMessage = messages[messages.length - 1] || null;

        return {
          id: issue.id,
          issueType: issue.issue_type,
          status: issue.status,
          orderId: issue.order_id,
          orderStatus: issue.orders?.status || null,
          customerName: issue.orders?.customers?.full_name || null,
          productName: issue.products?.name || null,
          poBatchName: issue.purchase_orders?.notes || null,
          reportedByName: issue.reported_by_name,
          createdAt: issue.created_at,
          messages,
          members: members.map((p: any) => ({
            userId: p.user_id,
            displayName: p.display_name,
            lastReadAt: p.last_read_at,
          })),
          lastActivityAt: lastMessage?.created_at || issue.created_at,
          unreadCount: countUnread(messages, myRow?.last_read_at, userName),
        };
      })
      // Cap the resolved archive so ancient issues don't bloat the payload
      .filter((t: any, _idx: number, all: any[]) => {
        if (t.status === 'open' || t.issueType === 'direct') return true;
        const resolvedRank = all.filter(
          (o: any) => o.status !== 'open' && o.issueType !== 'direct' &&
            new Date(o.lastActivityAt) > new Date(t.lastActivityAt)
        ).length;
        return resolvedRank < 30;
      })
      .sort((a: any, b: any) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

    const totalUnread = threads.reduce((sum: number, t: any) => sum + t.unreadCount, 0);

    return NextResponse.json({ threads, totalUnread });
  } catch (error: any) {
    console.error('Error fetching threads:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
