import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { itemId } = await req.json();

    if (!itemId) {
      return NextResponse.json({ error: 'No itemId provided' }, { status: 400 });
    }

    // 1. Fetch current item details
    const { data: item, error: fetchErr } = await supabase
      .from('purchase_order_items')
      .select('id, expected_qty, received_qty')
      .eq('id', itemId)
      .single();

    if (fetchErr) throw fetchErr;
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // 2. Set expected_qty = received_qty and status = 'received'
    const { error: updateErr } = await supabase
      .from('purchase_order_items')
      .update({
        expected_qty: item.received_qty,
        status: 'received'
      })
      .eq('id', itemId);

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error closing short pending PO item:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
