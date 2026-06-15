import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  
  const { data, error } = await supabase.from('purchase_orders').select('*').limit(1);
  return NextResponse.json({ hasNotes: 'notes' in (data?.[0] || {}), columns: Object.keys(data?.[0] || {}), error });
}
