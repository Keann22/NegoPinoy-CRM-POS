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

    const recipientNames = resolveRecipientNames(mentions || [], resolvedSenderName);
    if (recipientNames.length > 0) {
      const { data: issue } = await supabase
        .from('order_issues')
        .select('order_id')
        .eq('id', issueId)
        .single();

      await fanOutStaffNotifications(supabase, recipientNames, {
        senderName: resolvedSenderName,
        message,
        title: `${resolvedSenderName} tagged you in an order issue`,
        link: issue?.order_id ? `/dashboard/orders/${issue.order_id}` : '/dashboard',
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error adding message:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
