import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import { checkOrderNo } from '@/lib/services/online-order-tracking-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Live duplicate check for the order # field in the Buy dialogs (Owner/Admin only).
export async function GET(req: Request) {
  try {
    const sessionClient = await createSessionClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!isManagementUser(user)) {
      return NextResponse.json({ error: 'Only an admin can use the Procurement Sheet.' }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const result = await checkOrderNo(supabase, {
      platformOrderNo: searchParams.get('orderNo'),
      trackingNo: searchParams.get('trackingNo'),
      productIds: (searchParams.get('productIds') || '').split(',').filter(Boolean),
      excludePoId: searchParams.get('excludePoId'),
    });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in order-check GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
