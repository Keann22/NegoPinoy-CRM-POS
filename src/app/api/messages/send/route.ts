import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fanOutStaffNotifications, resolveRecipientNames } from '@/lib/services/staff-message-service';
import { getStaffByName, joinThreadMembers, type StaffIdentity } from '@/lib/services/thread-service';

export const dynamic = 'force-dynamic';

/**
 * Posts a message into an existing thread from the messaging center.
 * Auto-joins the sender and any @mentioned staff as thread members and fans
 * out bell notifications: to mentions on order/issue threads, and to the
 * other member(s) on direct threads (mention-joining is disabled there so a
 * 1:1 DM stays 1:1).
 */
export async function POST(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { issueId, senderId, senderName, senderRole, message, requiresAttention, mentions } = await req.json();

    if (!issueId || !senderId || !senderName || !message?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: issue, error: issueErr } = await supabase
      .from('order_issues')
      .select('id, issue_type, order_id, thread_participants(user_id, display_name, is_member)')
      .eq('id', issueId)
      .single();
    if (issueErr) throw issueErr;

    const isDirect = issue.issue_type === 'direct';
    const effectiveMentions: string[] = isDirect ? [] : (mentions || []);

    const { error: msgErr } = await supabase.from('order_issue_messages').insert({
      issue_id: issueId,
      sender_role: senderRole || 'staff',
      sender_name: senderName,
      message: message.trim(),
      requires_attention: requiresAttention || false,
      mentions: effectiveMentions,
    });
    if (msgErr) throw msgErr;

    const members: StaffIdentity[] = [{ userId: senderId, displayName: senderName }];
    if (effectiveMentions.length > 0) {
      const staffByName = await getStaffByName(supabase);
      for (const name of effectiveMentions) {
        const match = staffByName.get(name.trim().toLowerCase());
        if (match && match.userId !== senderId) members.push(match);
      }
    }
    await joinThreadMembers(supabase, issueId, members, senderId);

    if (isDirect) {
      const others = (issue.thread_participants || [])
        .filter((p: any) => p.is_member && p.user_id !== senderId)
        .map((p: any) => p.display_name);
      if (others.length > 0) {
        await fanOutStaffNotifications(supabase, others, {
          senderName,
          message: message.trim(),
          title: `New message from ${senderName}`,
          link: '/dashboard/messages',
        });
      }
    } else {
      const recipientNames = resolveRecipientNames(effectiveMentions, senderName);
      if (recipientNames.length > 0) {
        await fanOutStaffNotifications(supabase, recipientNames, {
          senderName,
          message: message.trim(),
          title: `${senderName} tagged you in a thread`,
          link: issue.order_id ? `/dashboard/orders/${issue.order_id}` : '/dashboard/messages',
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error sending thread message:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
