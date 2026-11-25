import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTaskCaller } from '@/lib/services/staff-tasks/task-caller';
import { fetchAllProofPayments } from '@/lib/services/payments/payment-log-queries';
import { isOwnPhoneNumberRef } from '@/lib/services/payments/payment-ref-utils';
import { PAYMENT_REVIEW_START_UTC } from '@/lib/services/payments/payment-review-cutoff';
import type { PaymentLogCounts, PaymentStatus } from '@/types/payment-log.types';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function countByStatus(
  supabase: ReturnType<typeof serviceClient>,
  status: PaymentStatus,
): Promise<number> {
  let query = supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('status', status)
    .not('proof_url', 'is', null)
    .neq('proof_url', '')
    .neq('payment_method', 'SPX COD Remittance');
  if (status === 'Pending') query = query.gte('payment_date', PAYMENT_REVIEW_START_UTC);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

export async function GET(request: Request) {
  try {
    const caller = await getTaskCaller();
    if (!caller?.isManagement) {
      return NextResponse.json({ error: 'Only the owners can view payment logs.' }, { status: 403 });
    }

    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const status: PaymentStatus =
      statusParam === 'Verified' || statusParam === 'Rejected' ? statusParam : 'Pending';

    const supabase = serviceClient();
    const [payments, pendingCount, verifiedCount, rejectedCount] = await Promise.all([
      fetchAllProofPayments(supabase, { status }),
      countByStatus(supabase, 'Pending'),
      countByStatus(supabase, 'Verified'),
      countByStatus(supabase, 'Rejected'),
    ]);

    const counts: PaymentLogCounts = {
      Pending: pendingCount,
      Verified: verifiedCount,
      Rejected: rejectedCount,
    };

    return NextResponse.json({ payments, counts });
  } catch (err: unknown) {
    console.error('Error loading payment logs:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load payments' },
      { status: 500 },
    );
  }
}

type ManageBody =
  | { action: 'bulk_status'; paymentIds: string[]; status: PaymentStatus; note?: string }
  | { action: 'update_reference'; paymentId: string; referenceNumber: string | null }
  | {
      action: 'confirm_statement_matches';
      matches: {
        paymentId: string;
        statementRef: string | null;
        statementDate: string;
        statementDesc: string;
      }[];
    };

export async function POST(request: Request) {
  try {
    const caller = await getTaskCaller();
    if (!caller?.isManagement) {
      return NextResponse.json({ error: 'Only the owners can update payment logs.' }, { status: 403 });
    }

    const body = (await request.json()) as ManageBody;
    const supabase = serviceClient();

    if (body.action === 'bulk_status') {
      const ids = Array.from(new Set(body.paymentIds || [])).filter(Boolean);
      if (ids.length === 0) {
        return NextResponse.json({ error: 'No payments selected.' }, { status: 400 });
      }
      if (!['Pending', 'Verified', 'Rejected'].includes(body.status)) {
        return NextResponse.json({ error: 'Invalid payment status.' }, { status: 400 });
      }

      if (body.note && body.note.trim()) {
        const tag = body.note.trim();
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          const { data: existing, error: readErr } = await supabase
            .from('payments')
            .select('id, notes')
            .in('id', chunk);
          if (readErr) throw readErr;

          for (const row of (existing || []) as { id: string; notes: string | null }[]) {
            const notes = row.notes || '';
            const nextNotes = notes.includes(tag) ? notes : `${notes.trim()} ${tag}`.trim();
            const { error: updErr } = await supabase
              .from('payments')
              .update({ status: body.status, notes: nextNotes })
              .eq('id', row.id);
            if (updErr) throw updErr;
          }
        }
      } else {
        for (let i = 0; i < ids.length; i += 100) {
          const chunk = ids.slice(i, i + 100);
          const { error: updErr } = await supabase
            .from('payments')
            .update({ status: body.status })
            .in('id', chunk);
          if (updErr) throw updErr;
        }
      }

      return NextResponse.json({ success: true, updatedCount: ids.length });
    }

    if (body.action === 'update_reference') {
      const cleaned = body.referenceNumber ? body.referenceNumber.trim() : null;
      if (cleaned && isOwnPhoneNumberRef(cleaned)) {
        return NextResponse.json(
          { error: 'That looks like our own GCash phone number, not the payment reference number.' },
          { status: 400 },
        );
      }

      const { error } = await supabase
        .from('payments')
        .update({ reference_number: cleaned || null })
        .eq('id', body.paymentId);
      if (error) throw error;

      return NextResponse.json({ success: true, referenceNumber: cleaned || null });
    }

    if (body.action === 'confirm_statement_matches') {
      const matches = body.matches || [];
      if (matches.length === 0) {
        return NextResponse.json({ error: 'No matches selected.' }, { status: 400 });
      }

      const ids = matches.map((m) => m.paymentId);
      const existingMap = new Map<string, { reference_number: string | null; notes: string | null }>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
          .from('payments')
          .select('id, reference_number, notes')
          .in('id', ids.slice(i, i + 200));
        if (error) throw error;
        for (const r of (data || []) as { id: string; reference_number: string | null; notes: string | null }[]) {
          existingMap.set(r.id, r);
        }
      }

      let updatedCount = 0;
      for (const m of matches) {
        const current = existingMap.get(m.paymentId);
        if (!current) continue;

        const descSnippet = m.statementDesc ? `: ${m.statementDesc.slice(0, 60).trim()}` : '';
        const refPart = m.statementRef ? `, Ref ${m.statementRef}` : '';
        const tag = `[Verified via GCash statement (${m.statementDate}${refPart}${descSnippet})]`;
        const notes = current.notes || '';
        const nextNotes = notes.includes('[Verified via GCash statement')
          ? notes
          : `${notes.trim()} ${tag}`.trim();

        const updatePayload: Record<string, unknown> = {
          status: 'Verified',
          notes: nextNotes,
        };
        if (
          (!current.reference_number || !current.reference_number.trim()) &&
          m.statementRef &&
          !isOwnPhoneNumberRef(m.statementRef)
        ) {
          updatePayload.reference_number = m.statementRef;
        }

        const { error: updErr } = await supabase
          .from('payments')
          .update(updatePayload)
          .eq('id', m.paymentId);
        if (updErr) throw updErr;
        updatedCount++;
      }

      return NextResponse.json({ success: true, updatedCount });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (err: unknown) {
    console.error('Error updating payment logs:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update payments' },
      { status: 500 },
    );
  }
}
