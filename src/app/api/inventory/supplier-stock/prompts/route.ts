import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupplierFlagCaller } from '@/lib/services/supplier-stock/supplier-flag-caller';
import { SupplierFlagError } from '@/lib/services/supplier-stock/supplier-flag-service';
import { answerSupplierPrompt, listSupplierPrompts, recordAgreedOnOrder } from '@/lib/services/supplier-stock/supplier-flag-prompts';
import type { SupplierPromptAnswer } from '@/types/supplier-stock.types';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function errorResponse(e: unknown) {
  if (e instanceof SupplierFlagError) return NextResponse.json({ error: e.message }, { status: 400 });
  const message = e instanceof Error ? e.message : String(e);
  console.error('supplier-stock prompts:', message);
  return NextResponse.json({ error: message }, { status: 500 });
}

// GET -> orders waiting on an item out at the supplier, for this person's pop-up
export async function GET() {
  try {
    const caller = await getSupplierFlagCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    return NextResponse.json({ prompts: await listSupplierPrompts(supabase, caller) });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST { flagId, orderId, answer, note? }              -> answer from the pop-up
// POST { action: 'agreed', orderId, productIds }       -> ticked "customer agrees" on New / Edit Order
export async function POST(req: Request) {
  try {
    const caller = await getSupplierFlagCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = await req.json() as {
      action?: string; flagId?: string; orderId?: string; answer?: SupplierPromptAnswer; note?: string; productIds?: string[];
    };
    if (body.action === 'agreed') {
      await recordAgreedOnOrder(supabase, String(body.orderId || ''), Array.isArray(body.productIds) ? body.productIds : [], caller.name);
      return NextResponse.json({ ok: true });
    }
    if (!body.flagId || !body.orderId || !body.answer) return NextResponse.json({ error: 'Missing answer' }, { status: 400 });
    await answerSupplierPrompt(supabase, { flagId: body.flagId, orderId: body.orderId, answer: body.answer, note: body.note }, caller);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
