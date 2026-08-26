import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Outstanding escalations for one user — the tags they're required to respond
 * to. A message escalates for me when: it @mentions me, its sender is an
 * admin/owner OR it's flagged Urgent (requires_attention), the thread is still
 * open, and I haven't replied in that thread since the tag. Replying is the
 * only way to clear it, which is the whole point of the forcing modal.
 *
 * Only tags from the last 14 days are considered so ancient threads (and tags
 * that predate this feature) don't nag forever.
 */
export async function GET(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const userName = (searchParams.get('userName') || '').trim();
    if (!userId || !userName) {
      return NextResponse.json({ error: 'userId and userName are required' }, { status: 400 });
    }
    const myNameLower = userName.toLowerCase();

    // Which display names belong to admins/owners — so an admin tag escalates
    // even when it isn't explicitly marked Urgent.
    const { data: users } = await supabase.rpc('get_all_users');
    const adminNames = new Set<string>();
    for (const u of users || []) {
      const meta = u.raw_user_meta_data || {};
      const name = `${meta.first_name || ''} ${meta.last_name || ''}`.trim().toLowerCase();
      const roles = Array.isArray(meta.roles) ? meta.roles : (meta.role ? [meta.role] : []);
      if (name && roles.some((r: string) => ['admin', 'owner'].includes(String(r).toLowerCase()))) {
        adminNames.add(name);
      }
    }

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // Messages that tag me, in still-open threads, recent. `mentions` stores the
    // exact display names chosen from the staff directory when tagging, so a
    // containment match on my display name is reliable.
    const { data: tagged, error } = await supabase
      .from('order_issue_messages')
      .select(
        'id, issue_id, sender_name, message, created_at, requires_attention, mentions, order_issues!inner(id, status, order_id, issue_type, products(name), orders(id, customers(full_name)), purchase_orders(id, notes))'
      )
      .contains('mentions', [userName])
      .eq('order_issues.status', 'open')
      .gt('created_at', since)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const candidates = (tagged || []).filter((m: any) => {
      const senderLower = (m.sender_name || '').trim().toLowerCase();
      if (senderLower === myNameLower) return false; // never nag me about my own message
      const isAdminSender = adminNames.has(senderLower);
      return m.requires_attention === true || isAdminSender;
    });

    if (candidates.length === 0) {
      return NextResponse.json({ escalations: [], count: 0 });
    }

    // Have I replied after each tag? Pull my messages in those threads.
    const issueIds = [...new Set(candidates.map((m: any) => m.issue_id))];
    const { data: threadMsgs } = await supabase
      .from('order_issue_messages')
      .select('issue_id, sender_name, created_at')
      .in('issue_id', issueIds);

    const myReplyTimesByIssue = new Map<string, number[]>();
    for (const r of threadMsgs || []) {
      if ((r.sender_name || '').trim().toLowerCase() !== myNameLower) continue;
      const arr = myReplyTimesByIssue.get(r.issue_id) || [];
      arr.push(new Date(r.created_at).getTime());
      myReplyTimesByIssue.set(r.issue_id, arr);
    }

    const escalations = candidates
      .filter((m: any) => {
        const replies = myReplyTimesByIssue.get(m.issue_id) || [];
        const tagTime = new Date(m.created_at).getTime();
        return !replies.some((t) => t > tagTime);
      })
      .map((m: any) => ({
        messageId: m.id,
        issueId: m.issue_id,
        senderName: m.sender_name,
        message: m.message,
        createdAt: m.created_at,
        requiresAttention: m.requires_attention === true,
        orderId: m.order_issues?.order_id || null,
        issueType: m.order_issues?.issue_type || null,
        productName: m.order_issues?.products?.name || null,
        customerName: m.order_issues?.orders?.customers?.full_name || null,
        poBatchName: m.order_issues?.purchase_orders?.notes || null,
      }));

    return NextResponse.json({ escalations, count: escalations.length });
  } catch (e: any) {
    console.error('Error fetching escalations:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
