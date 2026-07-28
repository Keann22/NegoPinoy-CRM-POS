import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { UNFULFILLED_STATUSES } from '@/lib/services/procurement-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type OrderRef = { kind: 'id' | 'prefix'; value: string };

type OrderContext = {
  id: string;
  shortId: string;
  status: string;
  customerName: string;
  salesPersonName: string | null;
  orderDate: string | null;
  totalAmount: number | null;
  amountPaid: number | null;
  balanceDue: number | null;
  items: { name: string; quantity: number; unitPrice: number }[];
};

type ProductContext = {
  id: string;
  name: string;
  sku: string | null;
  variantName: string | null;
  stockLevel: number | null;
  sellingPrice: number | null;
  supplierName: string | null;
};

type ThreadMessage = {
  senderName: string;
  senderRole: string | null;
  message: string;
  createdAt: string;
};

type ThreadContext = {
  source: 'procurement_issue' | 'order_issue';
  status: string | null;
  messages: ThreadMessage[];
};

type NotificationContext = {
  order: OrderContext | null;
  product: ProductContext | null;
  thread: ThreadContext | null;
};

/**
 * Pulls an order reference out of a notification, if it has one: either a full
 * order UUID in the link (/dashboard/orders/<uuid>) or the short "Order #XXXXXXX"
 * id (first 7 hex chars of the UUID) in the text. Mirrors the client helper in
 * notification-bell.tsx so both agree on what counts as an order reference.
 */
function extractOrderRef(notif: { link?: string; title?: string; message?: string }): OrderRef | null {
  const uuidMatch = String(notif.link || '').match(
    /\/dashboard\/orders\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  if (uuidMatch) return { kind: 'id', value: uuidMatch[1] };

  const shortMatch = `${notif.title || ''} ${notif.message || ''}`.match(/Order #([0-9A-Fa-f]{7})/);
  if (shortMatch) return { kind: 'prefix', value: shortMatch[1].toLowerCase() };

  return null;
}

/** Pulls the sender name out of the standard bell titles the messaging code writes. */
function extractSenderName(title?: string): string | null {
  const t = String(title || '');
  return (
    t.match(/^New message from (.+)$/)?.[1] ||
    t.match(/^(.+) tagged you in a thread$/)?.[1] ||
    null
  );
}

async function loadOrderContext(ref: OrderRef): Promise<OrderContext | null> {
  let query = supabase.from('orders').select('*');
  if (ref.kind === 'id') {
    query = query.eq('id', ref.value);
  } else {
    // A 7-hex-char prefix of the UUID. PostgREST rejects `id::text` cast filters,
    // but uuids compare bytewise, so a prefix match is a range check over the
    // 8th hex digit: [prefix0-000..., prefixf-fff...].
    query = query
      .gte('id', `${ref.value}0-0000-0000-0000-000000000000`)
      .lte('id', `${ref.value}f-ffff-ffff-ffff-ffffffffffff`);
  }

  const { data: order, error } = await query.limit(1).maybeSingle();
  if (error || !order) return null;

  let customerName = 'Unknown Customer';
  if (order.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('full_name')
      .eq('id', order.customer_id)
      .maybeSingle();
    if (customer?.full_name) customerName = customer.full_name;
  }

  const { data: items } = await supabase
    .from('order_items')
    .select('product_name, quantity, unit_price')
    .eq('order_id', order.id);

  return {
    id: order.id,
    shortId: String(order.id).slice(0, 7).toUpperCase(),
    status: order.status,
    customerName,
    salesPersonName: order.sales_person_name ?? null,
    orderDate: order.order_date ?? order.created_at ?? null,
    totalAmount: order.total_amount ?? null,
    amountPaid: order.amount_paid ?? null,
    balanceDue: order.balance_due ?? null,
    items: (items || []).map((i: any) => ({
      name: i.product_name,
      quantity: i.quantity,
      unitPrice: i.unit_price,
    })),
  };
}

async function loadProductContext(productId: string): Promise<ProductContext | null> {
  const { data: product } = await supabase
    .from('products')
    .select('id, name, sku, variant_name, stock_level, selling_price, supplier_pricing')
    .eq('id', productId)
    .maybeSingle();
  if (!product) return null;

  const supplierName =
    Array.isArray(product.supplier_pricing) && product.supplier_pricing.length > 0
      ? product.supplier_pricing[0]?.supplierName ?? null
      : null;

  return {
    id: product.id,
    name: product.name,
    sku: product.sku ?? null,
    variantName: product.variant_name ?? null,
    stockLevel: product.stock_level ?? null,
    sellingPrice: product.selling_price ?? null,
    supplierName,
  };
}

/** The order (this user's, else the oldest) still waiting on a shortage product. */
async function resolveOrderForProduct(productId: string, userName?: string): Promise<OrderContext | null> {
  const { data: rows } = await supabase
    .from('order_items')
    .select('orders!inner(id, order_date, status, sales_person_name)')
    .eq('product_id', productId)
    .in('orders.status', UNFULFILLED_STATUSES);

  const openOrders = (rows || [])
    .map((r: any) => r.orders)
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(a.order_date).getTime() - new Date(b.order_date).getTime());

  const target = openOrders.find((o: any) => o.sales_person_name === userName) || openOrders[0];
  if (!target) return null;
  return loadOrderContext({ kind: 'id', value: target.id });
}

/**
 * Finds the messaging thread a "New message"/"tagged you" notification came from.
 * Staff messages live in order_issue_messages; procurement notes live in the
 * separate procurement_issue_messages table — the older resolver only checked the
 * first, so product-level procurement notes ("Ordered na") dead-ended. We check
 * both and take whichever row is closest in time to when the bell fired.
 */
async function resolveThread(
  notif: { title?: string; message?: string; created_at?: string },
): Promise<{ thread: ThreadContext; orderId: string | null; productId: string | null } | null> {
  const senderName = extractSenderName(notif.title);
  const messagePrefix = String(notif.message || '').replace(/\.\.\.$/, '').trim();
  if (!messagePrefix) return null;

  const notifTime = notif.created_at ? new Date(notif.created_at).getTime() : Date.now();
  const like = `${messagePrefix.replace(/([%_\\])/g, '\\$1')}%`;

  // --- procurement_issue_messages ---
  let procQuery = supabase
    .from('procurement_issue_messages')
    .select('issue_id, created_at, procurement_issues!inner(id, product_id, status)')
    .ilike('message', like)
    .order('created_at', { ascending: false })
    .limit(10);
  if (senderName) procQuery = procQuery.eq('sender_name', senderName);
  const { data: procRows } = await procQuery;

  // --- order_issue_messages ---
  let issueQuery = supabase
    .from('order_issue_messages')
    .select('issue_id, created_at, order_issues!inner(id, order_id, product_id, status)')
    .ilike('message', like)
    .order('created_at', { ascending: false })
    .limit(10);
  if (senderName) issueQuery = issueQuery.eq('sender_name', senderName);
  const { data: issueRows } = await issueQuery;

  const dist = (t: string) => Math.abs(new Date(t).getTime() - notifTime);
  const bestProc = (procRows || []).sort((a: any, b: any) => dist(a.created_at) - dist(b.created_at))[0] as any;
  const bestIssue = (issueRows || []).sort((a: any, b: any) => dist(a.created_at) - dist(b.created_at))[0] as any;

  // Pick the source whose closest matching message sits nearest the bell time.
  const useProc =
    bestProc && (!bestIssue || dist(bestProc.created_at) <= dist(bestIssue.created_at));

  if (useProc && bestProc) {
    const issueId = bestProc.issue_id;
    const { data: msgs } = await supabase
      .from('procurement_issue_messages')
      .select('sender_name, sender_role, message, created_at')
      .eq('issue_id', issueId)
      .order('created_at', { ascending: true });
    return {
      thread: {
        source: 'procurement_issue',
        status: bestProc.procurement_issues?.status ?? null,
        messages: (msgs || []).map((m: any) => ({
          senderName: m.sender_name,
          senderRole: m.sender_role,
          message: m.message,
          createdAt: m.created_at,
        })),
      },
      orderId: null,
      productId: bestProc.procurement_issues?.product_id ?? null,
    };
  }

  if (bestIssue) {
    const issueId = bestIssue.issue_id;
    const { data: msgs } = await supabase
      .from('order_issue_messages')
      .select('sender_name, sender_role, message, created_at')
      .eq('issue_id', issueId)
      .order('created_at', { ascending: true });
    return {
      thread: {
        source: 'order_issue',
        status: bestIssue.order_issues?.status ?? null,
        messages: (msgs || []).map((m: any) => ({
          senderName: m.sender_name,
          senderRole: m.sender_role,
          message: m.message,
          createdAt: m.created_at,
        })),
      },
      orderId: bestIssue.order_issues?.order_id ?? null,
      productId: bestIssue.order_issues?.product_id ?? null,
    };
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const { notification, userName } = await req.json();
    if (!notification) {
      return NextResponse.json({ error: 'Missing notification' }, { status: 400 });
    }

    const context: NotificationContext = { order: null, product: null, thread: null };

    // 1. A direct order reference in the link/text always wins.
    const orderRef = extractOrderRef(notification);
    if (orderRef) {
      context.order = await loadOrderContext(orderRef);
    }

    // 2. Otherwise, trace the messaging thread the notification came from.
    if (!context.order) {
      const resolved = await resolveThread(notification);
      if (resolved) {
        context.thread = resolved.thread;
        if (resolved.productId) context.product = await loadProductContext(resolved.productId);
        if (resolved.orderId) {
          context.order = await loadOrderContext({ kind: 'id', value: resolved.orderId });
        } else if (resolved.productId) {
          context.order = await resolveOrderForProduct(resolved.productId, userName);
        }
      }
    }

    return NextResponse.json({ context });
  } catch (error: any) {
    console.error('Error resolving notification context:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
