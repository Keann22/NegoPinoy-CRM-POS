import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import {
  applySupplierReturnAction,
  createSupplierReturn,
  listSupplierReturns,
  setSupplierReplacementDays,
  SupplierReturnError,
} from '@/lib/services/supplier-return-service';
import type { NewSupplierReturn, SupplierReturnAction } from '@/types/supplier-returns.types';
import { staffRolesOf } from '@/lib/auth/staff-roles';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const INVENTORY_ROLES = ['owner', 'admin', 'inventory', 'inventory staff', 'inventory_staff', 'inventory-staff', 'staff'];

/** The signed-in user, whether they may use this page, and the name to log. */
async function getCaller() {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;
  const meta: any = user.user_metadata || {};
  const roles = staffRolesOf(user);
  const name = `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Staff';
  return {
    name,
    isManagement: isManagementUser(user),
    canUse: roles.some((r) => INVENTORY_ROLES.includes(r)),
  };
}

function errorResponse(e: unknown) {
  if (e instanceof SupplierReturnError) return NextResponse.json({ error: e.message }, { status: 400 });
  const message = e instanceof Error ? e.message : String(e);
  console.error('supplier-returns:', message);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const caller = await getCaller();
    if (!caller?.canUse) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    return NextResponse.json(await listSupplierReturns(supabase, caller.isManagement));
  } catch (e) {
    return errorResponse(e);
  }
}

// Report damaged: set pieces aside to return to the supplier.
export async function POST(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller?.canUse) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = (await req.json()) as NewSupplierReturn;
    return NextResponse.json(await createSupplierReturn(supabase, body, caller.name));
  } catch (e) {
    return errorResponse(e);
  }
}

// Move a return along (hand back, replacement, close, cancel) or set a supplier's waiting days.
export async function PATCH(req: Request) {
  try {
    const caller = await getCaller();
    if (!caller?.canUse) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = await req.json();
    if (body?.action === 'supplier_days') {
      if (!caller.isManagement) return NextResponse.json({ error: 'Only the owners can do this.' }, { status: 403 });
      await setSupplierReplacementDays(supabase, String(body.supplierId), Number(body.days));
    } else {
      await applySupplierReturnAction(supabase, body as SupplierReturnAction, caller.name, caller.isManagement);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
