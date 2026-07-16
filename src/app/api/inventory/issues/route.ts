import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const orderId = url.searchParams.get('orderId');

    if (orderId) {
      // Full issue history (any status) for one order, used by the Order Trail —
      // purchase_discrepancy issues never carry an order_id, so this naturally
      // stays scoped to picker/staff-message issues without needing an issue_type filter.
      const { data, error } = await supabase
        .from('order_issues')
        .select(`
          *,
          products(name, variant_name),
          order_issue_messages(id, sender_name, sender_role, message, created_at)
        `)
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        data.forEach((issue: any) => {
          if (issue.order_issue_messages) {
            issue.order_issue_messages.sort((a: any, b: any) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          }
        });
      }

      return NextResponse.json(data);
    }

    if (id) {
      // Get specific issue with messages and order/product info
      const { data, error } = await supabase
        .from('order_issues')
        .select(`
          *,
          products(name, variant_name, images),
          orders(id, status, sales_person_name, customer_id, customers(full_name), order_items(*)),
          purchase_orders(id, notes),
          order_issue_messages(*)
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      
      // Order messages by created_at
      if (data && data.order_issue_messages) {
        data.order_issue_messages.sort((a: any, b: any) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }
      
      return NextResponse.json(data);
    } else {
      // Get all open order issues (purchase-receiving issues live in the Inbox Drawer instead)
      const { data, error } = await supabase
        .from('order_issues')
        .select(`
          *,
          products(name, variant_name, images),
          orders(id, customer_id, customers(full_name)),
          order_issue_messages(id, sender_name, created_at)
        `)
        .eq('status', 'open')
        .eq('issue_type', 'order')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data) {
        data.forEach((issue: any) => {
          if (issue.order_issue_messages) {
            issue.order_issue_messages.sort((a: any, b: any) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          }
        });
      }

      return NextResponse.json(data);
    }
  } catch (error: any) {
    console.error('Error fetching issues:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { orderId, productId, note, reportedByName, requiresAttention, mentions } = await req.json();

    if (!orderId || !productId || !note) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Create the issue
    const { data: issue, error: issueErr } = await supabase
      .from('order_issues')
      .insert({ order_id: orderId, product_id: productId, status: 'open', reported_by_name: reportedByName })
      .select('id')
      .single();

    if (issueErr) throw issueErr;

    // 2. Add the initial message
    const { error: msgErr } = await supabase
      .from('order_issue_messages')
      .insert({
        issue_id: issue.id,
        sender_role: 'picker',
        sender_name: reportedByName || 'Picker',
        message: note,
        requires_attention: requiresAttention || false,
        mentions: mentions || []
      });

    if (msgErr) throw msgErr;

    return NextResponse.json({ success: true, issueId: issue.id });
  } catch (error: any) {
    console.error('Error creating issue:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { issueId, status, resolvedByName } = await req.json();

    if (!issueId || status !== 'resolved') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { data: issue } = await supabase
      .from('order_issues')
      .select('order_id, products(name)')
      .eq('id', issueId)
      .single();

    const { error } = await supabase
      .from('order_issues')
      .update({ status: 'resolved' })
      .eq('id', issueId);

    if (error) throw error;

    if (issue?.order_id) {
      await supabase.from('order_logs').insert({
        order_id: issue.order_id,
        status: 'Issue Resolved',
        user_name: resolvedByName || 'System',
        snapshot_data: (issue as any).products?.name ? { productName: (issue as any).products.name } : null,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error resolving issue:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
