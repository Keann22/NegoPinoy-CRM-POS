import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createStaffMessage } from '@/lib/services/staff-message-service';

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

    const issueId = await createStaffMessage(supabase, {
      issueType, orderId, productId, message, senderName, senderRole, recipientNames,
    });

    return NextResponse.json({ success: true, issueId });
  } catch (error: any) {
    console.error('Error creating staff message:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
