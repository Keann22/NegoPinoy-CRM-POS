import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { issueType, orderId, productId, message, senderName, senderRole, recipientNames } = await req.json();

    if (!message || !senderName || !Array.isArray(recipientNames) || recipientNames.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (issueType === 'order' && !orderId) {
      return NextResponse.json({ error: 'orderId is required for an order issue' }, { status: 400 });
    }

    if (issueType === 'product' && !productId) {
      return NextResponse.json({ error: 'productId is required for a product issue' }, { status: 400 });
    }

    // 1. Create the issue thread
    const { data: issue, error: issueErr } = await supabase
      .from('order_issues')
      .insert({
        order_id: issueType === 'order' ? orderId : null,
        product_id: issueType === 'product' ? productId : null,
        issue_type: 'staff_message',
        status: 'open',
        reported_by_name: senderName,
      })
      .select('id')
      .single();

    if (issueErr) throw issueErr;

    // 2. Add the initial message, tagging the recipients via the existing mentions mechanism
    const { error: msgErr } = await supabase
      .from('order_issue_messages')
      .insert({
        issue_id: issue.id,
        sender_role: senderRole || 'staff',
        sender_name: senderName,
        message,
        requires_attention: true,
        mentions: recipientNames,
      });

    if (msgErr) throw msgErr;

    // 3. Fan out one notification per tagged recipient
    const notificationRows = recipientNames.map((name: string) => ({
      sales_person_name: name,
      title: `New message from ${senderName}`,
      message: message.length > 140 ? `${message.slice(0, 140)}...` : message,
      link: '/dashboard',
      is_read: false,
      source: 'staff_message',
    }));

    const { error: notifErr } = await supabase.from('notifications').insert(notificationRows);
    if (notifErr) throw notifErr;

    return NextResponse.json({ success: true, issueId: issue.id });
  } catch (error: any) {
    console.error('Error creating staff message:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
