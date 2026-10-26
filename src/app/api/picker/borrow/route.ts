import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPriorityCaller } from '@/lib/priority/priority-auth';
import { BorrowError, listBorrowCandidates, recordBorrow } from '@/lib/services/borrow-service';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Orders an item could be borrowed from: ?productId=&toOrderId= */
export async function GET(req: Request) {
  try {
    if (!(await getPriorityCaller())) return bad('Not signed in', 401);
    const params = new URL(req.url).searchParams;
    const productId = params.get('productId') || '';
    const toOrderId = params.get('toOrderId') || '';
    if (!UUID.test(productId) || !UUID.test(toOrderId)) return bad('Invalid item or order');
    return NextResponse.json({ candidates: await listBorrowCandidates(supabase, productId, toOrderId) });
  } catch (error: any) {
    console.error('Error in borrow GET:', error);
    return bad(error.message || 'Failed to load', 500);
  }
}

/** Records a borrow: { productId, qty, fromOrderId, toOrderId, note? } */
export async function POST(req: Request) {
  try {
    const caller = await getPriorityCaller();
    if (!caller) return bad('Not signed in', 401);
    const { productId, qty, fromOrderId, toOrderId, note } = await req.json();
    const n = Math.floor(Number(qty));
    if (![productId, fromOrderId, toOrderId].every((v) => typeof v === 'string' && UUID.test(v))) return bad('Invalid item or order');
    if (fromOrderId === toOrderId) return bad('Pick a different order to borrow from.');
    if (!(n > 0 && n <= 100)) return bad('Invalid quantity');

    const result = await recordBorrow(supabase, { productId, qty: n, fromOrderId, toOrderId, note }, caller, req.url);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    if (error instanceof BorrowError) return bad(error.message);
    if (error?.code === '42P01' || error?.code === 'PGRST205') {
      return bad('Borrowing is not set up yet - run scripts/migrations/add_order_borrows.sql.', 500);
    }
    console.error('Error in borrow POST:', error);
    return bad(error.message || 'Failed to save', 500);
  }
}
