import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import {
  canSeeSource,
  discrepancyAccess,
  loadDiscrepancySource,
  serviceClient,
} from '@/lib/services/payments/payment-discrepancy-service';
import { ReconcileError, reconcilePayment } from '@/lib/services/payments/payment-reconcile-service';
import { ACTION_LABELS } from '@/lib/services/payments/payment-discrepancy-rules';
import type { ReconcileAction } from '@/types/payment-discrepancy.types';

export const runtime = 'nodejs';

const isAction = (a: unknown): a is ReconcileAction => typeof a === 'string' && a in ACTION_LABELS;

export async function POST(request: Request) {
  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please log in' }, { status: 401 });

    const { paymentId, action } = await request.json();
    if (!paymentId || !isAction(action)) {
      return NextResponse.json({ error: 'Missing paymentId or a valid action' }, { status: 400 });
    }

    // Only payments on the GCash mismatch list, and the GCash amount comes from that list.
    const supabase = serviceClient();
    const source = await loadDiscrepancySource(supabase, String(paymentId));
    if (!source) return NextResponse.json({ error: 'This payment is not on the GCash mismatch list' }, { status: 404 });
    const access = discrepancyAccess(user);
    if (!canSeeSource(source, access)) {
      return NextResponse.json({ error: 'You can only fix payments on your own orders' }, { status: 403 });
    }

    const message = await reconcilePayment(supabase, source, action, access.name);
    return NextResponse.json({ success: true, message });
  } catch (err: unknown) {
    if (err instanceof ReconcileError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Reconciliation error:', err);
    const message = err instanceof Error ? err.message : 'Failed to reconcile payment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
