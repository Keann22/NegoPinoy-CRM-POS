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

    if (id) {
      // Get specific issue with messages and product info
      const { data, error } = await supabase
        .from('procurement_issues')
        .select(`
          *,
          products(name, variant_name, images),
          procurement_issue_messages(*)
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      
      // Order messages by created_at
      if (data && data.procurement_issue_messages) {
        data.procurement_issue_messages.sort((a: any, b: any) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }
      
      return NextResponse.json(data);
    } else {
      // Get all open issues
      const { data, error } = await supabase
        .from('procurement_issues')
        .select(`
          *,
          products(name, variant_name, images),
          procurement_issue_messages(id)
        `)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return NextResponse.json(data);
    }
  } catch (error: any) {
    console.error('Error fetching issues:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { productId, note } = await req.json();

    if (!productId || !note) {
      return NextResponse.json({ error: 'Missing productId or note' }, { status: 400 });
    }

    // 1. Create the issue
    const { data: issue, error: issueErr } = await supabase
      .from('procurement_issues')
      .insert({ product_id: productId, status: 'open' })
      .select('id')
      .single();

    if (issueErr) throw issueErr;

    // 2. Add the initial message
    const { error: msgErr } = await supabase
      .from('procurement_issue_messages')
      .insert({
        issue_id: issue.id,
        sender_role: 'procurement',
        sender_name: 'Procurement',
        message: note
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
    const { issueId, status } = await req.json();

    if (!issueId || status !== 'resolved') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { error } = await supabase
      .from('procurement_issues')
      .update({ status: 'resolved' })
      .eq('id', issueId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error resolving issue:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
