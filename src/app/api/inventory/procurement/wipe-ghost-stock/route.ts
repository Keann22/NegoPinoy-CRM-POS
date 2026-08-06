import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
    const { productIds } = await request.json();

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: 'productIds must be a non-empty array' }, { status: 400 });
    }

    // Since we are resetting stock to 0 for these specific items
    for (const id of productIds) {
      const { error } = await supabase
        .from('products')
        .update({ stock_level: 0 })
        .eq('id', id);

      if (error) {
        console.error(`Failed to wipe stock for product ${id}:`, error);
        throw error;
      }
    }

    return NextResponse.json({ success: true, message: 'Stock successfully wiped to 0' });
  } catch (error: any) {
    console.error('Wipe stock error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
