import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fanOutStaffNotifications, resolveRecipientNames } from '@/lib/services/staff-message-service';

export async function POST(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { issueId, senderRole, senderName, message, requiresAttention, mentions } = await req.json();

    if (!issueId || !message || !senderRole) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const resolvedSenderName = senderName || (senderRole === 'sales' ? 'Sales' : 'Picker');

    const { error } = await supabase
      .from('order_issue_messages')
      .insert({
        issue_id: issueId,
        sender_role: senderRole,
        sender_name: resolvedSenderName,
        message: message,
        requires_attention: requiresAttention || false,
        mentions: mentions || []
      });

    if (error) throw error;

    // Everyone already in this issue thread: prior message senders + anyone tagged
    // in earlier messages. This makes a reply reach the whole group even when the
    // replier tags no one back — the thread behaves like a group chat.
    const { data: priorMessages } = await supabase
      .from('order_issue_messages')
      .select('sender_name, mentions')
      .eq('issue_id', issueId);

    const participantNames: string[] = [];
    for (const row of priorMessages || []) {
      if (row.sender_name) participantNames.push(row.sender_name);
      if (Array.isArray(row.mentions)) participantNames.push(...row.mentions);
    }

    const recipientNames = resolveRecipientNames(
      [...(mentions || []), ...participantNames],
      resolvedSenderName
    );
    if (recipientNames.length > 0) {
      const { data: issue } = await supabase
        .from('order_issues')
        .select('order_id')
        .eq('id', issueId)
        .single();

      // Keep the "tagged you" wording only for people the sender actually @-tagged
      // in this message; everyone else is looped in as a thread participant.
      const taggedKeys = new Set(
        resolveRecipientNames(mentions || [], resolvedSenderName).map((n) => n.toLowerCase())
      );
      const taggedNames = recipientNames.filter((n) => taggedKeys.has(n.toLowerCase()));
      const groupNames = recipientNames.filter((n) => !taggedKeys.has(n.toLowerCase()));
      const link = issue?.order_id ? `/dashboard/orders/${issue.order_id}` : '/dashboard';

      if (taggedNames.length > 0) {
        await fanOutStaffNotifications(supabase, taggedNames, {
          senderName: resolvedSenderName,
          message,
          title: `${resolvedSenderName} tagged you in an order issue`,
          link,
        });
      }
      if (groupNames.length > 0) {
        await fanOutStaffNotifications(supabase, groupNames, {
          senderName: resolvedSenderName,
          message,
          title: `${resolvedSenderName} replied in an order issue`,
          link,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error adding message:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
