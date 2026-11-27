import type { SupabaseClient } from '@supabase/supabase-js';
import { isMetaSystemNotice } from '@/lib/meta-system-notice';
import type { CustomerPersonaMetrics } from '@/types';
import {
  computeOrderMetricsAndCategories,
  selectCatalogShortlist,
  summarizePaydays,
  type CatalogCandidateForAi,
  type ChatMessageForAi,
  type OrderSummaryForAi,
  type RawProductRow,
} from './customer-profile-metrics';

export type { CatalogCandidateForAi, ChatMessageForAi, OrderItemForAi, OrderSummaryForAi } from './customer-profile-metrics';

export class CustomerProfileError extends Error {}

export interface CustomerRecordRow {
  id: string;
  psid: string | null;
  full_name: string | null;
  suki_tier: string | null;
  total_lifetime_spend: number | null;
  mobile_number: string | null;
  location_city: string | null;
  location_barangay: string | null;
  city: string | null;
  province: string | null;
  address_line: string | null;
  store_credit: number | null;
  preferred_honorific: string | null;
  preferred_payment: string | null;
  stove_type: string | null;
  family_size: string | null;
  specialty_cuisine: string | null;
  ai_summary_notes: string | null;
  pain_points: unknown;
}

export interface CustomerProfileContext {
  customer: CustomerRecordRow;
  orders: OrderSummaryForAi[];
  messages: ChatMessageForAi[];
  totalMessageCount: number;
  topCategories: string[];
  paydayHint: string | null;
  catalogShortlist: CatalogCandidateForAi[];
  metrics: CustomerPersonaMetrics;
}

export interface SharedCatalogSnapshot {
  productList: RawProductRow[];
  productCategoryMap: Map<string, string>;
  stoppedOrOosFlags: Set<string>;
}

const CUSTOMER_COLS =
  'id, psid, full_name, suki_tier, total_lifetime_spend, mobile_number, location_city, location_barangay, city, province, address_line, store_credit, preferred_honorific, preferred_payment, stove_type, family_size, specialty_cuisine, ai_summary_notes, pain_points';

interface RawOrderRow {
  id: string;
  status: string | null;
  order_date: string | null;
  created_at: string;
  total_amount: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  payment_method: string | null;
  next_due_date: string | null;
  shipping_name: string | null;
  delivery_instructions: string | null;
  not_for_shipping_reason: string | null;
  tracking_number: string | null;
  notes: string | null;
  order_items?: Array<{
    product_id: string | null;
    product_name: string | null;
    quantity: number | null;
    selling_price_at_sale: number | null;
    unit_price: number | null;
  }> | null;
}

// Verify Shipping pre-fills this SPX rider instruction on every order (ours, not
// the customer's), so it must not reach the AI as a customer clue.
const DEFAULT_SPX_NOTE_RE =
  /kuya\s+wag\s+nyo\s+po\s+sabihin\s+na\s+galing\s+shopee!*\s*sabihin\s+nyo\s+po\s+galing\s+ng\s+negosyanteng\s+pinoy\.*\s*(thank\s*you|salamat)\s*po!*\s*(:\))?/gi;

export function customerDeliveryNote(text: string | null | undefined): string | null {
  const rest = String(text || '').replace(DEFAULT_SPX_NOTE_RE, ' ').replace(/\s+/g, ' ').trim();
  return rest.length > 0 ? rest : null;
}

const PRODUCT_COLS =
  'id, name, category, selling_price, installment_price, sale_price, is_on_sale, is_induction_ready, shelf_stock, stock_level, parent_id, is_featured';

/** Whole live catalog, 1,000 rows per request (Supabase caps each response at 1,000). */
async function fetchAllProducts(supabase: SupabaseClient): Promise<RawProductRow[]> {
  const rows: RawProductRow[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_COLS)
      .not('name', 'ilike', '[DELETED]%')
      .not('name', 'ilike', '[ARCHIVED]%')
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as RawProductRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function resolveCustomerRow(
  supabase: SupabaseClient,
  target: { customerId?: string; psid?: string }
): Promise<CustomerRecordRow> {
  if (target.customerId) {
    const { data, error } = await supabase
      .from('customers')
      .select(CUSTOMER_COLS)
      .eq('id', target.customerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new CustomerProfileError('Customer not found');
    return data as CustomerRecordRow;
  }
  if (target.psid) {
    const { data, error } = await supabase
      .from('customers')
      .select(CUSTOMER_COLS)
      .eq('psid', target.psid)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new CustomerProfileError('No customer linked to this chat yet');
    return data as CustomerRecordRow;
  }
  throw new CustomerProfileError('Provide customerId or psid');
}

export async function loadSharedCatalogSnapshot(
  supabase: SupabaseClient
): Promise<SharedCatalogSnapshot> {
  const [productList, { data: activeFlags, error: flagErr }] = await Promise.all([
    fetchAllProducts(supabase),
    supabase.from('supplier_stock_flags').select('product_id, status').is('cleared_at', null),
  ]);
  if (flagErr) throw flagErr;
  const productCategoryMap = new Map(productList.map((p) => [p.id, p.category || 'Other']));
  const stoppedOrOosFlags = new Set(
    (activeFlags ?? [])
      .filter((f) => ['stop_selling', 'waiting_restock', 'other_variant'].includes(String(f.status)))
      .map((f) => String(f.product_id))
  );
  return { productList, productCategoryMap, stoppedOrOosFlags };
}

export async function buildCustomerProfileContext(
  supabase: SupabaseClient,
  target: { customerId?: string; psid?: string },
  sharedCatalog?: SharedCatalogSnapshot
): Promise<CustomerProfileContext> {
  const customer = await resolveCustomerRow(supabase, target);

  const [{ data: rawOrders, error: ordErr }, chatRes, catalogSnapshot] =
    await Promise.all([
      supabase
        .from('orders')
        .select(
          'id, status, order_date, created_at, total_amount, amount_paid, balance_due, payment_method, next_due_date, shipping_name, delivery_instructions, not_for_shipping_reason, tracking_number, notes, order_items(product_id, product_name, quantity, selling_price_at_sale, unit_price)'
        )
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(50),
      customer.psid
        ? supabase
            .from('conversation_logs')
            .select('sender_type, message_text, created_at, metadata', { count: 'exact' })
            .eq('customer_psid', customer.psid)
            .order('created_at', { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], count: 0, error: null }),
      sharedCatalog ? Promise.resolve(sharedCatalog) : loadSharedCatalogSnapshot(supabase),
    ]);

  if (ordErr) throw ordErr;
  if (chatRes.error) throw chatRes.error;

  const { productList, productCategoryMap, stoppedOrOosFlags } = catalogSnapshot;

  const orderRows = (rawOrders ?? []) as unknown as RawOrderRow[];
  const orderIds = orderRows.map((o) => o.id);
  const lastPaymentByOrder = new Map<string, string>();
  const allPaymentDates: string[] = [];

  if (orderIds.length > 0) {
    const { data: paymentsData } = await supabase
      .from('payments')
      .select('order_id, payment_date')
      .in('order_id', orderIds)
      .order('payment_date', { ascending: false });
    for (const p of paymentsData ?? []) {
      const oid = String(p.order_id);
      if (p.payment_date) {
        allPaymentDates.push(String(p.payment_date));
        if (!lastPaymentByOrder.has(oid)) lastPaymentByOrder.set(oid, String(p.payment_date));
      }
    }
  }

  const orders: OrderSummaryForAi[] = orderRows.map((o) => ({
    id: o.id,
    shortId: `#${o.id.slice(0, 7).toUpperCase()}`,
    status: o.status || 'Processing',
    orderDate: o.order_date || o.created_at,
    totalAmount: Number(o.total_amount || 0),
    amountPaid: Number(o.amount_paid || 0),
    balanceDue: Number(o.balance_due || 0),
    paymentMethod: o.payment_method || 'COD',
    nextDueDate: o.next_due_date,
    shippingName: o.shipping_name,
    deliveryInstructions: customerDeliveryNote(o.delivery_instructions),
    notForShippingReason: o.not_for_shipping_reason,
    trackingNumber: o.tracking_number,
    notes: o.notes,
    items: (o.order_items ?? []).map((it) => ({
      productId: it.product_id,
      productName: it.product_name || 'Item',
      quantity: Number(it.quantity || 1),
      unitPrice: Number(it.selling_price_at_sale ?? it.unit_price ?? 0),
    })),
  }));

  // Meta's chatbot handover notices are saved as customer messages; the customer didn't write them.
  const rawLogs = ((chatRes.data ?? []) as Array<{
    sender_type: string;
    message_text: string | null;
    created_at: string;
    metadata: Record<string, unknown> | null;
  }>).filter((m) => !isMetaSystemNotice(m.message_text));
  const messages: ChatMessageForAi[] = [...rawLogs]
    .reverse()
    .map((m) => ({
      senderType: m.sender_type,
      text: String(m.message_text || '').trim(),
      createdAt: m.created_at,
      hasImage: Boolean(m.metadata && typeof m.metadata === 'object' && 'image_url' in m.metadata),
    }))
    .filter((m) => m.text.length > 0);

  const lastCustomerMsg = rawLogs.find((m) => m.sender_type === 'customer');
  const lastChatAt = rawLogs[0]?.created_at ?? null;
  const within24hWindow = Boolean(
    lastCustomerMsg && Date.now() - new Date(lastCustomerMsg.created_at).getTime() <= 24 * 3600 * 1000
  );

  const { metrics, topCategories } = computeOrderMetricsAndCategories({
    accountName: customer.full_name,
    orders,
    messages,
    totalMessageCount: chatRes.count ?? messages.length,
    lastChatAt,
    within24hWindow,
    lastPaymentByOrder,
    productCategoryMap,
  });

  const catalogShortlist = selectCatalogShortlist({
    productList,
    stoppedOrOosFlags,
    orders,
    messages,
    topCategories,
    stoveType: customer.stove_type,
  });

  return {
    customer,
    orders,
    messages,
    totalMessageCount: chatRes.count ?? messages.length,
    topCategories,
    paydayHint: summarizePaydays(allPaymentDates),
    catalogShortlist,
    metrics,
  };
}
