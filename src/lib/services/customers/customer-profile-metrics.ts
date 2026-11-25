import type { CustomerPersonaMetrics } from '@/types';
import { shelfNumberOf } from '@/lib/services/inventory/shelf-stock-service';

export interface OrderItemForAi {
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderSummaryForAi {
  id: string;
  shortId: string;
  status: string;
  orderDate: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  paymentMethod: string;
  nextDueDate: string | null;
  shippingName: string | null;
  deliveryInstructions: string | null;
  notForShippingReason: string | null;
  trackingNumber: string | null;
  notes: string | null;
  items: OrderItemForAi[];
}

export interface ChatMessageForAi {
  senderType: string;
  text: string;
  createdAt: string;
  hasImage: boolean;
}

export interface CatalogCandidateForAi {
  id: string;
  name: string;
  category: string;
  price: number;
  installmentPrice: number | null;
  isInductionReady: boolean;
  shelfStock: number;
}

export interface RawProductRow {
  id: string;
  name: string;
  category: string | null;
  selling_price: number | null;
  installment_price: number | null;
  sale_price: number | null;
  is_on_sale: boolean | null;
  is_induction_ready: boolean | null;
  shelf_stock: number | null;
  stock_level: number | null;
  parent_id: string | null;
  is_featured: boolean | null;
}

const BUS_RE = /\b(bus|victory|five\s*star|partas|florida|genesis|philtranco|dltb|jac\s*liner|ceresm|bicol\s*isaro)\b/i;
const CLOSED_STATUSES = new Set(['Cancelled', 'Returned', 'Completed', 'Shipped']);
const STOP_WORDS = new Set([
  'po', 'opo', 'maam', 'mam', 'sir', 'ang', 'yung', 'ung', 'mga', 'may', 'meron', 'wala',
  'para', 'ito', 'yan', 'magkano', 'order', 'please', 'paki', 'ba', 'na', 'pa', 'ko', 'nyo',
  'lang', 'din', 'rin', 'naman', 'kasi', 'available', 'sent', 'photo', 'image',
]);

function normNameTokens(name: string | null | undefined): string[] {
  return String(name || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
}

export function namesDiffer(accountName: string | null, shippingName: string | null): boolean {
  const a = normNameTokens(accountName);
  const b = normNameTokens(shippingName);
  if (a.length === 0 || b.length === 0) return false;
  return !b.some((tok) => a.includes(tok));
}

export function summarizePaydays(dates: string[]): string | null {
  if (dates.length < 2) return null;
  let midMonth = 0;
  let monthEnd = 0;
  for (const d of dates) {
    const day = new Date(d).getDate();
    if (Number.isNaN(day)) continue;
    if (day >= 12 && day <= 18) midMonth++;
    else if (day >= 26 || day <= 3) monthEnd++;
  }
  if (midMonth >= 2 && monthEnd >= 2) return 'Usually pays around 15th & 30th (kinsenas/katapusan)';
  if (midMonth >= 2) return 'Often pays around mid-month (15th)';
  if (monthEnd >= 2) return 'Often pays around month-end (28th–3rd)';
  return null;
}

export function extractChatKeywords(messages: ChatMessageForAi[]): string[] {
  const freq = new Map<string, number>();
  for (const m of messages) {
    if (m.senderType !== 'customer') continue;
    for (const w of m.text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
      if (w.length < 4 || STOP_WORDS.has(w) || /^\d+$/.test(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  return Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
}

export function computeOrderMetricsAndCategories(params: {
  accountName: string | null;
  orders: OrderSummaryForAi[];
  messages: ChatMessageForAi[];
  totalMessageCount: number;
  lastChatAt: string | null;
  within24hWindow: boolean;
  lastPaymentByOrder: Map<string, string>;
  productCategoryMap: Map<string, string>;
}): { metrics: CustomerPersonaMetrics; topCategories: string[] } {
  const { orders, messages, totalMessageCount, lastChatAt, within24hWindow, lastPaymentByOrder, productCategoryMap } = params;
  const now = Date.now();
  let completedOrderCount = 0;
  let cancelledOrReturnedCount = 0;
  let totalSpent = 0;
  let codCount = 0;
  let layawayCount = 0;
  let installmentCount = 0;
  let fullPaymentCount = 0;
  let busShipCount = 0;
  let overdueLayawayCount = 0;
  let overdueBalanceTotal = 0;
  let differentReceiverCount = 0;
  const categoryCount = new Map<string, number>();

  for (const o of orders) {
    if (o.status === 'Cancelled' || o.status === 'Returned') {
      cancelledOrReturnedCount++;
      continue;
    }
    if (o.status === 'Completed' || o.status === 'Shipped') completedOrderCount++;
    totalSpent += o.totalAmount;
    if (o.paymentMethod === 'COD') codCount++;
    else if (o.paymentMethod === 'Lay-away') layawayCount++;
    else if (o.paymentMethod === 'Installment') installmentCount++;
    else if (o.paymentMethod === 'Full Payment') fullPaymentCount++;

    const shipBlob = [o.trackingNumber, o.notForShippingReason, o.notes].filter(Boolean).join(' ');
    if (BUS_RE.test(shipBlob)) busShipCount++;
    if (namesDiffer(params.accountName, o.shippingName)) differentReceiverCount++;

    const isLayawayOrInst = o.paymentMethod === 'Lay-away' || o.paymentMethod === 'Installment';
    if (!CLOSED_STATUSES.has(o.status) && isLayawayOrInst && o.balanceDue > 100) {
      const refDateStr = o.nextDueDate || lastPaymentByOrder.get(o.id) || o.orderDate;
      const refMs = new Date(refDateStr).getTime();
      const overdue = o.nextDueDate ? refMs < now : now - refMs > 30 * 86400000;
      if (overdue) {
        overdueLayawayCount++;
        overdueBalanceTotal += o.balanceDue;
      }
    }

    for (const it of o.items) {
      const cat = it.productId ? productCategoryMap.get(it.productId) : null;
      if (cat) categoryCount.set(cat, (categoryCount.get(cat) || 0) + it.quantity);
    }
  }

  const activeOrderCount = orders.length - cancelledOrReturnedCount;
  const topCategories = Array.from(categoryCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([c]) => c);

  return {
    topCategories,
    metrics: {
      orderCount: orders.length,
      completedOrderCount,
      cancelledOrReturnedCount,
      totalSpent: Math.round(totalSpent * 100) / 100,
      avgOrderValue: activeOrderCount > 0 ? Math.round((totalSpent / activeOrderCount) * 100) / 100 : 0,
      codCount,
      layawayCount,
      installmentCount,
      fullPaymentCount,
      busShipCount,
      overdueLayawayCount,
      overdueBalanceTotal: Math.round(overdueBalanceTotal * 100) / 100,
      differentReceiverCount,
      chatMessageCount: totalMessageCount,
      customerMessageCount: messages.filter((m) => m.senderType === 'customer').length,
      lastChatAt,
      lastOrderAt: orders[0]?.orderDate ?? null,
      within24hWindow,
    },
  };
}

export function selectCatalogShortlist(params: {
  productList: RawProductRow[];
  stoppedOrOosFlags: Set<string>;
  orders: OrderSummaryForAi[];
  messages: ChatMessageForAi[];
  topCategories: string[];
  stoveType: string | null;
}): CatalogCandidateForAi[] {
  const { productList, stoppedOrOosFlags, orders, messages, topCategories, stoveType } = params;
  const parentIds = new Set(productList.map((p) => p.parent_id).filter((id): id is string => Boolean(id)));
  const keywords = extractChatKeywords(messages);
  const boughtIds = new Set(orders.flatMap((o) => o.items.map((i) => i.productId).filter(Boolean)));
  const topCatSet = new Set(topCategories);

  return productList
    .filter((p) => !parentIds.has(p.id))
    .map((p) => ({
      row: p,
      shelf: shelfNumberOf({ shelf_stock: p.shelf_stock, stock_level: p.stock_level }, 0),
    }))
    .filter(({ row, shelf }) => shelf > 0 && !stoppedOrOosFlags.has(row.id) && !boughtIds.has(row.id))
    .map(({ row, shelf }) => {
      const nameLow = row.name.toLowerCase();
      let score = row.is_featured ? 3 : 0;
      if (row.category && topCatSet.has(row.category)) score += 4;
      for (const kw of keywords) if (nameLow.includes(kw)) score += 5;
      if (stoveType === 'Induction' && row.is_induction_ready) score += 2;
      return { row, shelf, score };
    })
    .sort((a, b) => b.score - a.score || b.shelf - a.shelf)
    .slice(0, 25)
    .map(({ row, shelf }) => ({
      id: row.id,
      name: row.name,
      category: row.category || 'General',
      price: Number(row.is_on_sale && row.sale_price ? row.sale_price : row.selling_price || 0),
      installmentPrice: row.installment_price ? Number(row.installment_price) : null,
      isInductionReady: Boolean(row.is_induction_ready),
      shelfStock: shelf,
    }));
}
