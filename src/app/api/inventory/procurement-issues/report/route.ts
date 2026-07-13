import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createStaffMessage, getAdminAndInventoryLeadNames, resolveRecipientNames } from '@/lib/services/staff-message-service';
import { getAffectedSalesReps } from '@/lib/services/procurement-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { productId, note, senderName, senderRole, extraRecipientNames } = await req.json();

    if (!productId || !note) {
      return NextResponse.json({ error: 'Missing productId or note' }, { status: 400 });
    }

    const resolvedSenderName = senderName || 'Inventory';

    const [adminAndLeadNames, salesRepNames] = await Promise.all([
      getAdminAndInventoryLeadNames(supabase),
      getAffectedSalesReps(supabase, productId),
    ]);

    const recipientNames = resolveRecipientNames(
      [...adminAndLeadNames, ...salesRepNames, ...(Array.isArray(extraRecipientNames) ? extraRecipientNames : [])],
      resolvedSenderName
    );

    if (recipientNames.length === 0) {
      return NextResponse.json({ error: 'No recipients resolved for this issue' }, { status: 400 });
    }

    const issueId = await createStaffMessage(supabase, {
      issueType: 'product',
      productId,
      message: note,
      senderName: resolvedSenderName,
      senderRole: senderRole || 'inventory',
      recipientNames,
    });

    return NextResponse.json({ success: true, issueId });
  } catch (error: any) {
    console.error('Error reporting procurement issue:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
