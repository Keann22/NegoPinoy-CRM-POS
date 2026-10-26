import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPriorityCaller } from '@/lib/priority/priority-auth';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Is this order's customer marked "nagmamadali"? ?orderId= */
export async function GET(req: Request) {
  try {
    if (!(await getPriorityCaller())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const orderId = new URL(req.url).searchParams.get('orderId') || '';
    if (!UUID.test(orderId)) return NextResponse.json({ error: 'Invalid order' }, { status: 400 });
    const { data, error } = await supabase
      .from('order_priority_events')
      .select('kind, note, created_by_name, created_at')
      .eq('order_id', orderId)
      .in('kind', ['urgent', 'urgent_cleared'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return NextResponse.json({ urgent: null });
    const latest = data?.[0];
    return NextResponse.json({
      urgent: latest?.kind === 'urgent' ? { note: latest.note, byName: latest.created_by_name, at: latest.created_at } : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
