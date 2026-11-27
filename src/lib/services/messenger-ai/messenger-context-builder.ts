import type { SupabaseClient } from '@supabase/supabase-js';
import type { SharedCatalogSnapshot } from '@/lib/services/customers/customer-profile-context';
import { shelfNumberOf } from '@/lib/services/inventory/shelf-stock-service';
import { listPeople } from '@/lib/services/staff-tasks/staff-task-service';
import { OPEN_ORDER_STATUSES, shortOrderId } from '@/lib/shipping/ship-hold-rules';
import { getHoldDetails } from '@/lib/services/shipping/ship-hold-service';
import { isMetaSystemNotice } from '@/lib/meta-system-notice';
import type {
  CopilotOpenOrderOption,
  CopilotWaitingPrompt,
  MessengerAiActionType,
  MessengerAiLesson,
  VariantSearchResult,
} from '@/types';
import { loadCustomerPhase2Context } from './messenger-phase2-context';

export class CopilotError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface ReadyMessageBurst {
  psid: string;
  logIds: string[];
  messages: Array<{ id: string; text: string; createdAt: string; imageUrl: string | null }>;
  chatExcerpt: string;
  attachmentUrl: string | null;
}

export interface BurstContext {
  burst: ReadyMessageBurst;
  customer: {
    id: string | null;
    fullName: string | null;
    mobileNumber: string | null;
    addressSummary: string | null;
    storeCredit: number;
  };
  openOrders: CopilotOpenOrderOption[];
  recentClosedOrders: CopilotOpenOrderOption[];
  waitingPrompts: CopilotWaitingPrompt[];
  recentThread: Array<{ senderType: string; text: string; createdAt: string }>;
  candidateVariants: VariantSearchResult[];
  matchedAliases: Array<{ phrase: string; productId: string; productName: string }>;
  lessons: MessengerAiLesson[];
  assigneeIds: string[];
  assigneeName: string | null;
}

/** Owner, 2026-11-28: scan only chats from the last 2 hours. */
export const COPILOT_LOOKBACK_HOURS = 2;
/** A burst that fails this many scans is given up (no more Gemini calls). */
export const COPILOT_MAX_SCAN_ATTEMPTS = 3;

const TRIVIAL_RE = /^(hi+|hello+|hey+|po|opo|((yes+|oo|ok+|okay|oke|sige|ge|ty|thank\s*you|thanks|salamat|noted)(\s*po)?)|amen|god\s*bless|welcome|👍+|🙏+|❤️+|\[sent\s+a\s+sticker\]|\[thumbs\s+up\])[.!?\s👍🙏❤️]*$/i;

export function isTrivialBurst(
  messages: Array<{ text: string; imageUrl: string | null }>
): boolean {
  if (messages.some((m) => Boolean(m.imageUrl))) return false;
  const combined = messages.map((m) => (m.text || '').trim()).filter(Boolean).join(' ');
  if (!combined) return true;
  if (/\d{3,}|#|gcash|bayad|cancel|hold|dagdag|add|palit|bawas|swap|change|resend|basag|sira|bus|victory/i.test(combined)) {
    return false;
  }
  return messages.every((m) => TRIVIAL_RE.test((m.text || '').trim()));
}

export async function findReadyMessageBursts(
  supabase: SupabaseClient,
  opts: { maxBursts?: number; quietSeconds?: number; lookbackHours?: number } = {}
): Promise<{ readyBursts: ReadyMessageBurst[]; trivialLogIds: string[] }> {
  const maxBursts = Math.min(20, Math.max(1, opts.maxBursts ?? 6));
  const quietMs = Math.max(0, opts.quietSeconds ?? 75) * 1000;
  // Owner, 2026-11-28: only the last 2 hours. Older chats are treated as handled by sales.
  const lookbackHours = Math.min(168, Math.max(1, opts.lookbackHours ?? COPILOT_LOOKBACK_HOURS));
  const since = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();

  // Newest first so a fresh payment isn't stuck behind older chats; regrouped oldest-first below.
  const { data, error } = await supabase
    .from('conversation_logs')
    .select('id, customer_psid, message_text, created_at, metadata')
    .eq('sender_type', 'customer')
    .is('ai_analyzed_at', null)
    .lt('ai_scan_attempts', COPILOT_MAX_SCAN_ATTEMPTS)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) throw error;
  const trivialLogIds: string[] = [];

  const byPsid = new Map<
    string,
    Array<{ id: string; text: string; createdAt: string; imageUrl: string | null }>
  >();

  for (const row of [...(data ?? [])].reverse()) {
    const psid = String(row.customer_psid || '').trim();
    if (!psid) continue;
    if (isMetaSystemNotice(row.message_text)) {
      trivialLogIds.push(String(row.id));
      continue;
    }
    const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : null) as Record<string, unknown> | null;
    const imageUrl = typeof meta?.image_url === 'string' ? meta.image_url : null;
    const list = byPsid.get(psid) || [];
    list.push({
      id: String(row.id),
      text: String(row.message_text || '').trim(),
      createdAt: String(row.created_at),
      imageUrl,
    });
    byPsid.set(psid, list);
  }

  const now = Date.now();
  const candidates: Array<ReadyMessageBurst & { sortMs: number }> = [];

  for (const [psid, msgs] of byPsid.entries()) {
    const firstMs = new Date(msgs[0].createdAt).getTime();
    const lastMs = new Date(msgs[msgs.length - 1].createdAt).getTime();
    const quietEnough = now - lastMs >= quietMs;
    const spanMaxed = now - firstMs >= 180_000;
    if (!quietEnough && !spanMaxed) continue;

    if (isTrivialBurst(msgs)) {
      trivialLogIds.push(...msgs.map((m) => m.id));
      continue;
    }

    const attachmentUrl = [...msgs].reverse().find((m) => m.imageUrl)?.imageUrl ?? null;
    const chatExcerpt = msgs
      .map((m) => `${m.text}${m.imageUrl && !m.text.includes('photo') ? ' [photo]' : ''}`)
      .filter(Boolean)
      .join('\n')
      .slice(0, 1200);
    candidates.push({
      psid,
      logIds: msgs.map((m) => m.id),
      messages: msgs,
      chatExcerpt,
      attachmentUrl,
      sortMs: lastMs,
    });
  }

  // Prioritize photo bursts (payment screenshots) newest-first, then text bursts oldest-first.
  candidates.sort((a, b) => {
    const aPhoto = a.attachmentUrl ? 1 : 0;
    const bPhoto = b.attachmentUrl ? 1 : 0;
    if (aPhoto !== bPhoto) return bPhoto - aPhoto;
    return aPhoto ? b.sortMs - a.sortMs : a.sortMs - b.sortMs;
  });

  const readyBursts: ReadyMessageBurst[] = candidates
    .slice(0, maxBursts)
    .map(({ sortMs: _omit, ...burst }) => burst);

  return { readyBursts, trivialLogIds };
}

function normTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

export async function buildBurstContext(
  supabase: SupabaseClient,
  burst: ReadyMessageBurst,
  catalog: SharedCatalogSnapshot
): Promise<BurstContext> {
  const [{ data: custRow }, { data: threadRows }, { data: aliasRows }, { data: lessonRows }, staffPeople] =
    await Promise.all([
      supabase
        .from('customers')
        .select('id, full_name, mobile_number, address_line, city, province, store_credit')
        .eq('psid', burst.psid)
        .maybeSingle(),
      supabase
        .from('conversation_logs')
        .select('sender_type, message_text, created_at')
        .eq('customer_psid', burst.psid)
        .order('created_at', { ascending: false })
        .limit(16),
      supabase
        .from('messenger_product_aliases')
        .select('phrase_normalized, product_id, product_name, hit_count')
        .order('hit_count', { ascending: false })
        .limit(200),
      supabase
        .from('messenger_ai_feedback_lessons')
        .select('id, action_id, action_type, verdict, error_category, chat_excerpt, what_ai_did, what_was_right, lesson_text, active, created_by_name, created_at')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(10),
      listPeople(supabase),
    ]);

  let openOrders: CopilotOpenOrderOption[] = [];
  const salesNames: string[] = [];

  if (custRow?.id) {
    const { data: ordRows, error: ordErr } = await supabase
      .from('orders')
      .select(
        'id, status, order_date, created_at, payment_method, total_amount, balance_due, is_printed, sales_person_name, order_items(product_id, product_name, quantity, selling_price_at_sale, unit_price)'
      )
      .eq('customer_id', custRow.id)
      .in('status', OPEN_ORDER_STATUSES)
      .order('created_at', { ascending: false })
      .limit(12);
    if (ordErr) throw ordErr;

    const orderIds = (ordRows ?? []).map((o) => String(o.id));
    await getHoldDetails(supabase, orderIds).catch(() => new Map());

    openOrders = (ordRows ?? []).map((o) => {
      if (o.sales_person_name) salesNames.push(String(o.sales_person_name));
      const rawItems = (o.order_items ?? []) as Array<{
        product_id: string | null;
        product_name: string | null;
        quantity: number | null;
        selling_price_at_sale: number | null;
        unit_price: number | null;
      }>;
      const items = rawItems
        .filter((it) => Boolean(it.product_id))
        .map((it) => ({
          productId: String(it.product_id),
          productName: String(it.product_name || 'Item'),
          quantity: Number(it.quantity || 1),
          unitPrice: Number(it.selling_price_at_sale ?? it.unit_price ?? 0),
        }));
      return {
        id: String(o.id),
        shortId: shortOrderId(String(o.id)),
        status: String(o.status || 'Processing'),
        orderDate: String(o.order_date || o.created_at).slice(0, 10),
        paymentMethod: String(o.payment_method || 'COD'),
        totalAmount: Number(o.total_amount || 0),
        balanceDue: Number(o.balance_due || 0),
        isPrinted: Boolean(o.is_printed),
        itemsSummary: items.map((i) => `${i.quantity}x ${i.productName}`).join(', ') || 'No items',
        items,
      };
    });
  }

  const openOrderIds = openOrders.map((o) => o.id);
  const { waitingPrompts, recentClosedOrders } = await loadCustomerPhase2Context(
    supabase,
    custRow?.id ? String(custRow.id) : null,
    openOrderIds
  );

  const lowerText = burst.chatExcerpt.toLowerCase();
  const matchedAliases = ((aliasRows ?? []) as Array<{ phrase_normalized: string; product_id: string; product_name: string }>)
    .filter((a) => lowerText.includes(a.phrase_normalized.toLowerCase()))
    .slice(0, 6)
    .map((a) => ({ phrase: a.phrase_normalized, productId: a.product_id, productName: a.product_name }));

  const parentIds = new Set(catalog.productList.map((p) => p.parent_id).filter((id): id is string => Boolean(id)));
  const aliasIds = new Set(matchedAliases.map((a) => a.productId));
  const tokens = normTokens(burst.chatExcerpt);

  const candidateVariants: VariantSearchResult[] = catalog.productList
    .filter((p) => !parentIds.has(p.id))
    .map((p) => {
      const nameLow = p.name.toLowerCase();
      let score = aliasIds.has(p.id) ? 50 : 0;
      for (const t of tokens) if (nameLow.includes(t)) score += 4;
      const shelf = shelfNumberOf({ shelf_stock: p.shelf_stock, stock_level: p.stock_level }, 0);
      if (shelf > 0) score += 1;
      return {
        id: p.id,
        name: p.name,
        sellingPrice: Number(p.is_on_sale && p.sale_price ? p.sale_price : p.selling_price || 0),
        shelfStock: shelf,
        score,
      };
    })
    .filter((x) => x.score > 1)
    .sort((a, b) => b.score - a.score || b.shelfStock - a.shelfStock)
    .slice(0, 25)
    .map(({ id, name, sellingPrice, shelfStock }) => ({ id, name, sellingPrice, shelfStock }));

  const targetAgent = salesNames[0]?.trim().toLowerCase() || '';
  const matchedPerson = targetAgent
    ? staffPeople.find((p) => p.name.trim().toLowerCase() === targetAgent)
    : undefined;
  const salesPeople = staffPeople.filter((p) => p.roles.some((r) => r.toLowerCase() === 'sales'));
  const assigneeIds = matchedPerson
    ? matchedPerson.key.split(',').filter(Boolean)
    : Array.from(new Set(salesPeople.flatMap((p) => p.key.split(',').filter(Boolean))));
  const assigneeName = matchedPerson ? matchedPerson.name : salesNames[0] || (salesPeople.length ? 'Sales Team' : null);

  const lessons: MessengerAiLesson[] = ((lessonRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    actionId: r.action_id ? String(r.action_id) : null,
    actionType: String(r.action_type) as MessengerAiActionType,
    verdict: (String(r.verdict) === 'rejected' ? 'rejected' : 'edited'),
    errorCategory: r.error_category ? String(r.error_category) : null,
    chatExcerpt: String(r.chat_excerpt || ''),
    whatAiDid: (r.what_ai_did as Record<string, unknown>) || {},
    whatWasRight: (r.what_was_right as Record<string, unknown>) || {},
    lessonText: String(r.lesson_text || ''),
    active: Boolean(r.active),
    createdByName: r.created_by_name ? String(r.created_by_name) : null,
    createdAt: String(r.created_at),
  }));

  const recentThread = [...(threadRows ?? [])]
    .reverse()
    .map((m) => ({
      senderType: String(m.sender_type || 'customer'),
      text: String(m.message_text || '').trim(),
      createdAt: String(m.created_at),
    }))
    .filter((m) => m.text.length > 0);

  return {
    burst,
    customer: {
      id: custRow?.id ? String(custRow.id) : null,
      fullName: custRow?.full_name ? String(custRow.full_name) : null,
      mobileNumber: custRow?.mobile_number ? String(custRow.mobile_number) : null,
      addressSummary: [custRow?.address_line, custRow?.city, custRow?.province].filter(Boolean).join(', ') || null,
      storeCredit: Number(custRow?.store_credit || 0),
    },
    openOrders,
    recentClosedOrders,
    waitingPrompts,
    recentThread,
    candidateVariants,
    matchedAliases,
    lessons: lessons.slice(0, 8),
    assigneeIds,
    assigneeName,
  };
}
