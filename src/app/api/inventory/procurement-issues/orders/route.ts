import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const productId = url.searchParams.get('productId');

    if (!productId) {
      return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
    }

    // Get all order_items with this productId
    const { data: items, error: iErr } = await supabase
      .from('order_items')
      .select('order_id, quantity, orders(id, customer_id, status, sales_person_name, created_at, customers(name))')
      .eq('product_id', productId);

    if (iErr) throw iErr;

    // Filter to active orders only
    const activeStatuses = ['pending', 'processing', 'for_pick_up', 'for_shipping'];
    
    const affectedOrders = items
      .filter((i: any) => i.orders && activeStatuses.includes(i.orders.status))
      .map((i: any) => ({
        orderId: i.orders.id,
        customerId: i.orders.customer_id || null,
        quantityNeeded: i.quantity,
        status: i.orders.status,
        customerName: i.orders.customers?.name || 'Unknown Customer',
        salesPerson: i.orders.sales_person_name || 'Unknown',
        createdAt: i.orders.created_at
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ orders: affectedOrders });
  } catch (error: any) {
    console.error('Error fetching affected orders:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
