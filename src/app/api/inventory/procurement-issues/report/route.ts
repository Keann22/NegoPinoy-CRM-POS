import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminAndInventoryLeadNames, resolveRecipientNames, fanOutStaffNotifications } from '@/lib/services/staff-message-service';
import { getAffectedSalesRepOrders } from '@/lib/services/procurement-service';

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

    // 1. Create the issue in the same procurement_issues table the dashboard's
    // "Procurement Issues" widget already reads from (GET /api/inventory/procurement-issues),
    // so this shows up there with its existing Affected Orders / reply / resolve UI,
    // instead of a separate order_issues thread nothing else displays.
    const { data: issue, error: issueErr } = await supabase
      .from('procurement_issues')
      .insert({ product_id: productId, status: 'open' })
      .select('id')
      .single();

    if (issueErr) throw issueErr;

    const { error: msgErr } = await supabase
      .from('procurement_issue_messages')
      .insert({
        issue_id: issue.id,
        sender_role: senderRole || 'procurement',
        sender_name: resolvedSenderName,
        message: note,
      });

    if (msgErr) throw msgErr;

    // 2. Separately, still ping the people who need to know via the Bell —
    // Admin/Jas/Jasmin plus any sales rep with an order waiting on this product.
    const [adminAndLeadNames, repOrders] = await Promise.all([
      getAdminAndInventoryLeadNames(supabase),
      getAffectedSalesRepOrders(supabase, productId),
    ]);

    const recipientNames = resolveRecipientNames(
      [...adminAndLeadNames, ...Array.from(repOrders.keys()), ...(Array.isArray(extraRecipientNames) ? extraRecipientNames : [])],
      resolvedSenderName
    );

    await fanOutStaffNotifications(supabase, recipientNames, {
      senderName: resolvedSenderName,
      message: note,
      // Sales reps get linked straight to their affected order so the Bell can
      // pop the order card; admins/leads keep the default dashboard link
      linkByRecipient: new Map(
        Array.from(repOrders, ([name, orderId]) => [name, `/dashboard/orders/${orderId}`])
      ),
    });

    return NextResponse.json({ success: true, issueId: issue.id });
  } catch (error: any) {
    console.error('Error reporting procurement issue:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
