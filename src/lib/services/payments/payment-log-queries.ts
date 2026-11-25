import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaymentLogItem, PaymentStatus } from '@/types/payment-log.types';
import { PAYMENT_REVIEW_START_UTC } from './payment-review-cutoff';

interface RawPaymentRow {
  id: string;
  order_id: string | null;
  amount: number | string;
  payment_date: string;
  created_at: string;
  payment_method: string;
  notes: string | null;
  reference_number: string | null;
  proof_url: string | null;
  ocr_amount: number | string | null;
  ocr_payment_date: string | null;
  ocr_payment_time: string | null;
  status: string | null;
  transfer_id: string | null;
  transfer_amount: number | string | null;
}

interface RawOrderRow {
  id: string;
  status: string | null;
  sales_person_name: string | null;
  customers: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null;
}

function normalizeStatus(status: string | null): PaymentStatus {
  if (status === 'Verified' || status === 'Rejected') return status;
  return 'Pending';
}

export async function fetchAllProofPayments(
  supabase: SupabaseClient,
  options: { status?: PaymentStatus } = {},
): Promise<PaymentLogItem[]> {
  const rows: RawPaymentRow[] = [];
  const PAGE_SIZE = 1000;

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('payments')
      .select(
        'id, order_id, amount, payment_date, created_at, payment_method, notes, reference_number, proof_url, ocr_amount, ocr_payment_date, ocr_payment_time, status, transfer_id, transfer_amount',
      )
      .not('proof_url', 'is', null)
      .neq('proof_url', '')
      .neq('payment_method', 'SPX COD Remittance')
      .order('payment_date', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (options.status) {
      query = query.eq('status', options.status);
    }
    if (options.status === 'Pending') {
      query = query.gte('payment_date', PAYMENT_REVIEW_START_UTC);
    }

    const { data, error } = await query;
    if (error) throw error;
    const chunk = (data || []) as RawPaymentRow[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }

  return attachOrderInfo(supabase, rows);
}

export async function fetchPaymentsForStatement(supabase: SupabaseClient): Promise<PaymentLogItem[]> {
  const rows: RawPaymentRow[] = [];
  const PAGE_SIZE = 1000;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('payments')
      .select(
        'id, order_id, amount, payment_date, created_at, payment_method, notes, reference_number, proof_url, ocr_amount, ocr_payment_date, ocr_payment_time, status, transfer_id, transfer_amount',
      )
      .or(`status.eq.Verified,and(status.eq.Pending,payment_date.gte.${PAYMENT_REVIEW_START_UTC})`)
      .neq('payment_method', 'SPX COD Remittance')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const chunk = (data || []) as RawPaymentRow[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }

  return attachOrderInfo(supabase, rows);
}

async function attachOrderInfo(
  supabase: SupabaseClient,
  rows: RawPaymentRow[],
): Promise<PaymentLogItem[]> {
  const orderIds = Array.from(new Set(rows.map((r) => r.order_id).filter((id): id is string => Boolean(id))));
  const orderMap = new Map<
    string,
    { order_status: string | null; customer_id: string | null; customer_name: string; sales_person_name: string }
  >();

  for (let i = 0; i < orderIds.length; i += 200) {
    const batch = orderIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, sales_person_name, customers(id, full_name)')
      .in('id', batch);
    if (error) throw error;

    for (const o of (data || []) as RawOrderRow[]) {
      const cust = Array.isArray(o.customers) ? o.customers[0] : o.customers;
      orderMap.set(o.id, {
        order_status: o.status || null,
        customer_id: cust?.id || null,
        customer_name: cust?.full_name || 'Unknown Customer',
        sales_person_name: o.sales_person_name || 'Unknown',
      });
    }
  }

  return rows.map((r) => {
    const info = r.order_id ? orderMap.get(r.order_id) : undefined;
    return {
      id: r.id,
      order_id: r.order_id,
      amount: Number(r.amount) || 0,
      payment_date: r.payment_date,
      created_at: r.created_at,
      payment_method: r.payment_method,
      notes: r.notes,
      reference_number: r.reference_number,
      proof_url: r.proof_url,
      ocr_amount: r.ocr_amount === null || r.ocr_amount === undefined ? null : Number(r.ocr_amount),
      ocr_payment_date: r.ocr_payment_date || null,
      ocr_payment_time: r.ocr_payment_time || null,
      status: normalizeStatus(r.status),
      transfer_id: r.transfer_id,
      transfer_amount: r.transfer_amount === null || r.transfer_amount === undefined ? null : Number(r.transfer_amount),
      order_status: info?.order_status ?? null,
      customer_id: info?.customer_id ?? null,
      customer_name: info?.customer_name ?? 'Unknown Customer',
      sales_person_name: info?.sales_person_name ?? 'Unknown',
    };
  });
}
