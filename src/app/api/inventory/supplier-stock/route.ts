import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupplierFlagCaller } from '@/lib/services/supplier-stock/supplier-flag-caller';
import {
  SupplierFlagError, clearSupplierFlag, closeOldIssues, listActiveFlags, listFlagsWithOrders, listOldIssues, setSupplierFlag,
} from '@/lib/services/supplier-stock/supplier-flag-service';
import type { SetSupplierFlagInput } from '@/types/supplier-stock.types';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function errorResponse(e: unknown) {
  if (e instanceof SupplierFlagError) return NextResponse.json({ error: e.message }, { status: 400 });
  const message = e instanceof Error ? e.message : String(e);
  console.error('supplier-stock:', message);
  return NextResponse.json({ error: message }, { status: 500 });
}

// GET                  -> active statuses (New Order, Procurement Sheet badges)
// GET ?productIds=a,b  -> only those products
// GET ?page=1          -> Wala sa Supplier page: statuses with waiting orders + old reports
export async function GET(req: Request) {
  try {
    const caller = await getSupplierFlagCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const params = new URL(req.url).searchParams;
    if (params.get('page')) {
      const [flags, oldIssues] = await Promise.all([listFlagsWithOrders(supabase), listOldIssues(supabase)]);
      return NextResponse.json({ flags, oldIssues, canSetStatus: caller.canSetStatus });
    }
    const ids = params.get('productIds');
    const flags = await listActiveFlags(supabase, ids ? ids.split(',').filter(Boolean) : undefined);
    return NextResponse.json({ flags, canSetStatus: caller.canSetStatus });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST SetSupplierFlagInput -> set or change a product's status (owners, Jas)
export async function POST(req: Request) {
  try {
    const caller = await getSupplierFlagCaller();
    if (!caller?.canSetStatus) return NextResponse.json({ error: 'Only the owners and Jas can set this.' }, { status: 403 });
    const body = (await req.json()) as SetSupplierFlagInput;
    const id = await setSupplierFlag(supabase, body, caller.name);
    if (body.oldIssueId) await closeOldIssues(supabase, body.productId, `Replaced by a status (${caller.name}).`, body.oldIssueId);
    return NextResponse.json({ id });
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH { action: 'clear', productId }     -> available again (owners, Jas)
// PATCH { action: 'close_old', issueId }   -> close an old free-text report without a status
export async function PATCH(req: Request) {
  try {
    const caller = await getSupplierFlagCaller();
    if (!caller?.canSetStatus) return NextResponse.json({ error: 'Only the owners and Jas can change this.' }, { status: 403 });
    const body = (await req.json()) as { action?: string; productId?: string; issueId?: string };
    if (body.action === 'clear' && body.productId) {
      const cleared = await clearSupplierFlag(supabase, body.productId, 'back_in_stock', caller.name);
      return NextResponse.json({ cleared });
    }
    if (body.action === 'close_old' && body.issueId) {
      await closeOldIssues(supabase, '', `Closed by ${caller.name} (no status needed).`, body.issueId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
