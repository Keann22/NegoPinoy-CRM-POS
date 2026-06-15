import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function PATCH(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    
    const { productId, note } = await req.json();

    if (!productId) {
      return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
    }

    // Update the procurement_note for the product
    // Note can be null (to resolve the issue) or a string (to report an issue)
    const { error } = await supabase
      .from('products')
      .update({ procurement_note: note })
      .eq('id', productId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating procurement note:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
