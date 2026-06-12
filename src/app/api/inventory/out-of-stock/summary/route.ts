import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    // 1. Get all pending out of stock items
    const { data: pendingItems, error: pErr } = await supabase
      .from('out_of_stock_items')
      .select(`
        product_id, reported_qty, notes, created_at,
        products (name, variant_name)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (pErr) throw pErr;

    // 2. Get all officially out of stock items (live stock < 0)
    const { data: liveOS, error: lErr } = await supabase
      .from('products')
      .select('id, name, variant_name, stock_level')
      .lt('stock_level', 0);

    if (lErr) throw lErr;

    const summaryMap = new Map();

    // Add live OS first
    for (const p of liveOS) {
      summaryMap.set(p.id, {
        productId: p.id,
        productName: `${p.name} ${p.variant_name ? `[${p.variant_name}]` : ''}`,
        qty: Math.abs(p.stock_level),
        status: 'Verified & Live',
        notes: ''
      });
    }

    // Override with pending if exists (since it's a more recent physical count)
    for (const p of pendingItems) {
      if (!summaryMap.has(p.product_id)) {
        summaryMap.set(p.product_id, {
          productId: p.product_id,
          productName: `${p.products.name} ${p.products.variant_name ? `[${p.products.variant_name}]` : ''}`,
          qty: p.reported_qty,
          status: 'Pending Verification',
          notes: p.notes || ''
        });
      } else {
        const existing = summaryMap.get(p.product_id);
        existing.qty = p.reported_qty;
        existing.status = 'Pending Verification';
        existing.notes = p.notes || existing.notes;
      }
    }

    const summary = Array.from(summaryMap.values());
    
    // Sort by name
    summary.sort((a, b) => a.productName.localeCompare(b.productName));

    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error('Error in out-of-stock summary API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
