import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { staffRolesOf } from '@/lib/auth/staff-roles';
import { getProductHistory, moveProductHistory } from '@/lib/services/product-handover-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Same roles that may create/edit products.
function canManageProducts(user: any): boolean {
  const roles = staffRolesOf(user);
  return ['owner', 'admin', 'inventory'].some((r) => roles.includes(r));
}

async function authorize() {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  return canManageProducts(user) ? user : null;
}

// What is still open on a product (shown before its first variants are added).
export async function GET(req: Request) {
  try {
    if (!(await authorize())) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
    const productId = new URL(req.url).searchParams.get('productId');
    if (!productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    return NextResponse.json(await getProductHistory(supabase, productId));
  } catch (error: any) {
    console.error('Error in products/handover GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Move open orders, purchases and stock from a product onto one of its variants.
export async function POST(req: Request) {
  try {
    const user = await authorize();
    if (!user) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
    const { fromId, toId, actorName } = await req.json();
    if (!fromId || !toId) return NextResponse.json({ error: 'fromId and toId are required' }, { status: 400 });
    const result = await moveProductHistory(supabase, fromId, toId, actorName || user.email || 'Staff');
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in products/handover POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
