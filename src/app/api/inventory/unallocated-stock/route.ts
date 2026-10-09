import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getInventoryListStockInfo } from '@/lib/services/inventory-list-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const items = await getInventoryListStockInfo(supabase);
    return NextResponse.json({ items });
  } catch (error: any) {
    console.error('Error fetching unallocated stock:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
