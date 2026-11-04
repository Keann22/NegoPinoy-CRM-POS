import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { staffRolesOf } from '@/lib/auth/staff-roles';
import { RECONCILED_MARK, reconcileRules } from './payment-discrepancy-rules';
import type {
  DiscrepancyItem,
  DiscrepancySource,
  SharedTransferPayment,
} from '@/types/payment-discrepancy.types';

/**
 * The GCash mismatch list is a one-time snapshot (made 2026-10-30 from the GCash
 * statement) kept in the server-only table payment_discrepancies. It holds customer
 * data, so it is never stored in the repo. This joins it with what payments say now.
 */
interface DiscrepancyRow {
  payment_id: string;
  order_id: string;
  order_short_id: string;
  sales_person: string;
  sales_person_id: string | null;
  customer_name: string;
  recorded_ref: string;
  actual_ref: string;
  recorded_amount: number | string;
  gcash_amount: number | string;
  difference: number | string;
  payment_date: string | null;
  match_type: string | null;
  proof_url: string | null;
  notes: string | null;
  payment_method: string | null;
}

function toSource(r: DiscrepancyRow): DiscrepancySource {
  return {
    paymentId: r.payment_id,
    orderId: r.order_id,
    orderShortId: r.order_short_id,
    salesPerson: r.sales_person,
    salesPersonId: r.sales_person_id ?? undefined,
    customerName: r.customer_name,
    recordedRef: r.recorded_ref,
    actualRef: r.actual_ref,
    recordedAmount: Number(r.recorded_amount),
    gcashAmount: Number(r.gcash_amount),
    difference: Number(r.difference),
    paymentDate: r.payment_date ?? '',
    matchType: r.match_type ?? undefined,
    proofUrl: r.proof_url ?? undefined,
    notes: r.notes ?? undefined,
    paymentMethod: r.payment_method ?? undefined,
  };
}

/** The whole list, oldest payment first (160 rows, well under the 1000-row cap). */
export async function loadDiscrepancySources(supabase: SupabaseClient): Promise<DiscrepancySource[]> {
  const { data, error } = await supabase
    .from('payment_discrepancies')
    .select('*')
    .order('payment_date', { ascending: true });
  if (error) throw error;
  return (data as DiscrepancyRow[]).map(toSource);
}

export async function loadDiscrepancySource(
  supabase: SupabaseClient,
  paymentId: string,
): Promise<DiscrepancySource | null> {
  const { data, error } = await supabase
    .from('payment_discrepancies')
    .select('*')
    .eq('payment_id', paymentId)
    .maybeSingle();
  if (error) throw error;
  return data ? toSource(data as DiscrepancyRow) : null;
}

export interface LivePayment {
  id: string;
  amount: number;
  notes: string | null;
  status: string | null;
  reference_number: string | null;
  order_id: string | null;
}

const LIVE_COLUMNS = 'id, amount, notes, status, reference_number, order_id';

export function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export interface DiscrepancyAccess {
  userId: string;
  name: string;
  firstName: string;
  isManagement: boolean;
}

export function discrepancyAccess(user: User): DiscrepancyAccess {
  const meta = user.user_metadata || {};
  const roles = staffRolesOf(user);
  return {
    userId: user.id,
    name: `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Staff',
    firstName: String(meta.first_name || '').toLowerCase(),
    isManagement: roles.includes('owner') || roles.includes('admin'),
  };
}

/** Owners see every row; a sales agent sees only their own orders. */
export function canSeeSource(source: DiscrepancySource, access: DiscrepancyAccess): boolean {
  if (access.isManagement) return true;
  if (source.salesPersonId && source.salesPersonId === access.userId) return true;
  return !!access.firstName && source.salesPerson.toLowerCase().includes(access.firstName);
}

export const isReconciled = (notes: string | null | undefined) => (notes || '').includes(RECONCILED_MARK);

export const shortId = (id: string | null) => (id || '').slice(0, 7).toUpperCase();

/** Every spelling of this payment's GCash reference (the statement drops leading zeros). */
export function refsFor(source: DiscrepancySource, live?: LivePayment | null): string[] {
  const raw = [live?.reference_number, source.recordedRef, source.actualRef];
  const refs = raw.flatMap((r) => (r ? [r, r.trim()] : [])).filter(Boolean);
  return [...new Set(refs)];
}

export async function loadPayments(supabase: SupabaseClient, ids: string[]): Promise<Map<string, LivePayment>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('payments').select(LIVE_COLUMNS).in('id', ids);
  if (error) throw error;
  return new Map((data as LivePayment[]).map((p) => [p.id, { ...p, amount: Number(p.amount) }]));
}

export async function loadPaymentsByRef(supabase: SupabaseClient, refs: string[]): Promise<LivePayment[]> {
  if (refs.length === 0) return [];
  const { data, error } = await supabase.from('payments').select(LIVE_COLUMNS).in('reference_number', refs);
  if (error) throw error;
  return (data as LivePayment[]).map((p) => ({ ...p, amount: Number(p.amount) }));
}

/** The other payments that used the same GCash transfer. */
export function othersOnTransfer(
  source: DiscrepancySource,
  live: LivePayment | null | undefined,
  byRef: LivePayment[],
): SharedTransferPayment[] {
  const refs = new Set(refsFor(source, live).map((r) => r.trim()));
  const seen = new Set<string>();
  return byRef
    .filter((p) => p.id !== source.paymentId && refs.has((p.reference_number || '').trim()))
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .map((p) => ({
      paymentId: p.id,
      orderShortId: shortId(p.order_id),
      amount: p.amount,
      isReconciled: isReconciled(p.notes),
    }));
}

/** The rows a person may see, with live amounts, shared transfers and the safe buttons. */
export async function buildDiscrepancyItems(
  supabase: SupabaseClient,
  sources: DiscrepancySource[],
): Promise<DiscrepancyItem[]> {
  const live = await loadPayments(supabase, sources.map((s) => s.paymentId));
  const refs = [...new Set(sources.flatMap((s) => refsFor(s, live.get(s.paymentId))))];
  const byRef = await loadPaymentsByRef(supabase, refs);

  return sources.map((source) => {
    const p = live.get(source.paymentId);
    const others = othersOnTransfer(source, p, byRef);
    const othersTotal = others.reduce((sum, o) => sum + o.amount, 0);
    const base = { ...source, others, othersTotal, notes: p?.notes ?? source.notes };

    if (!p) {
      return { ...base, isResolved: false, allowedActions: [], blockedReason: 'This payment was deleted.' };
    }
    if (isReconciled(p.notes)) {
      return { ...base, recordedAmount: p.amount, isResolved: true, allowedActions: [] };
    }
    const rules = reconcileRules({
      recorded: p.amount,
      gcash: source.gcashAmount,
      otherCount: others.length,
      othersTotal,
    });
    return {
      ...base,
      recordedAmount: p.amount,
      isResolved: false,
      allowedActions: rules.allowed,
      blockedReason: rules.blockedReason,
    };
  });
}
