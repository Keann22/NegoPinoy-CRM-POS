import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { snapshotTime, items } = await req.json();

    if (!snapshotTime || !items || items.length === 0) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Insert report
    const { data: report, error: reportError } = await supabase
      .from('out_of_stock_reports')
      .insert({ snapshot_time: snapshotTime, status: 'pending' })
      .select('id')
      .single();

    if (reportError) throw reportError;

    // Insert items
    const itemsToInsert = items.map((i: any) => ({
      report_id: report.id,
      product_id: i.productId,
      reported_qty: i.reportedQty,
      notes: i.notes || null,
      status: 'pending'
    }));

    const { error: itemsError } = await supabase
      .from('out_of_stock_items')
      .insert(itemsToInsert);

    if (itemsError) throw itemsError;

    return NextResponse.json({ success: true, reportId: report.id });
  } catch (error: any) {
    console.error('Error in out-of-stock API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
