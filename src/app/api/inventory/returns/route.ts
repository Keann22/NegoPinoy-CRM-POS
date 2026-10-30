import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Read-only log from the old 'Process return' button. New returns are cases:
// /api/inventory/customer-returns (they check every piece before restocking).
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');

    let query = supabase
      .from('returns')
      .select('*')
      .order('created_at', { ascending: false });

    if (orderId) query = query.eq('order_id', orderId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ returns: data || [] });
  } catch (error: any) {
    console.error('Error in GET /returns:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
