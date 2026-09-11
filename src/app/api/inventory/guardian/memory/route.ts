import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getProductGuardianMemory } from '@/lib/services/inventory/inventory-guardian-memory-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json({ success: false, error: 'productId query param is required' }, { status: 400 });
    }

    const memory = await getProductGuardianMemory(supabase, productId);
    return NextResponse.json({ success: true, memory });
  } catch (error: any) {
    console.error('Error fetching guardian memory:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
