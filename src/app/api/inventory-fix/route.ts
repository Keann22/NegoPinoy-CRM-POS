import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { adjustments } = await req.json();

    if (!adjustments || !Array.isArray(adjustments)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Process adjustments in sequence or parallel
    for (const { dbId, targetStock } of adjustments) {
      if (!dbId || typeof targetStock !== 'number') continue;
      
      const { error } = await supabase
        .from('products')
        .update({ stock_level: targetStock })
        .eq('id', dbId);

      if (error) {
        console.error(`Error updating product ${dbId}:`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: `Updated ${adjustments.length} products.` });
  } catch (error: any) {
    console.error('Error in inventory-fix API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
