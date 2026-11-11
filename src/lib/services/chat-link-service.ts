import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AccountMergeDetail,
  ChatLinkResult,
  MatchedChatCandidate,
  MatchedCustomerCandidate,
} from '@/types';

/**
 * Connecting a Messenger chat (PSID) to a customer account.
 *
 * The database function refuses two risky cases and says why:
 * - TARGET_HAS_OTHER_CHAT: the account already has another Messenger chat.
 * - ACCOUNT_MERGE_REQUIRED: the Messenger contact already has its own orders or
 *   store credit, so linking merges two accounts. Ask staff first, then call
 *   again with mergeAccounts: true.
 * Every link is logged in customer_merges and can be undone.
 */

export type ChatLinkMethod = 'manual' | 'auto_phone_name' | 'new_customer';

function parseMergeDetail(details: unknown): AccountMergeDetail {
  const empty: AccountMergeDetail = { name: null, orders: 0, store_credit: 0, carryovers: 0, bus_shipments: 0 };
  if (typeof details !== 'string') return empty;
  try {
    const d = JSON.parse(details) as Partial<AccountMergeDetail>;
    return {
      name: d.name ?? null,
      orders: Number(d.orders) || 0,
      store_credit: Number(d.store_credit) || 0,
      carryovers: Number(d.carryovers) || 0,
      bus_shipments: Number(d.bus_shipments) || 0,
    };
  } catch {
    return empty;
  }
}

export async function linkChatToCustomer(
  supabase: SupabaseClient,
  psid: string,
  customerId: string,
  opts: { mergeAccounts?: boolean; method?: ChatLinkMethod } = {}
): Promise<ChatLinkResult> {
  const { data, error } = await supabase.rpc('link_chat_psid_to_customer', {
    p_psid: psid,
    p_customer_id: customerId,
    p_merge_accounts: opts.mergeAccounts ?? false,
    p_method: opts.method ?? 'manual',
  });

  if (error) {
    const message = error.message || 'Could not connect the chat.';
    if (message.startsWith('ACCOUNT_MERGE_REQUIRED')) {
      return { status: 'needs_merge', detail: parseMergeDetail(error.details) };
    }
    if (message.startsWith('TARGET_HAS_OTHER_CHAT')) {
      return { status: 'has_other_chat', message: message.replace(/^TARGET_HAS_OTHER_CHAT:\s*/, '') };
    }
    return { status: 'error', message };
  }
  return { status: 'linked', customer: (data ?? {}) as Record<string, unknown> };
}

/** Plain-language warning shown before merging two accounts. */
export function describeAccountMerge(detail: AccountMergeDetail, targetName: string | null): string {
  const parts: string[] = [];
  if (detail.orders > 0) parts.push(`${detail.orders} order${detail.orders === 1 ? '' : 's'}`);
  if (Math.abs(detail.store_credit) > 0.009) parts.push(`₱${detail.store_credit.toLocaleString('en-PH')} store credit`);
  if (detail.carryovers > 0) parts.push(`${detail.carryovers} carryover${detail.carryovers === 1 ? '' : 's'}`);
  if (detail.bus_shipments > 0) parts.push(`${detail.bus_shipments} bus shipment${detail.bus_shipments === 1 ? '' : 's'}`);
  const who = detail.name || 'This Messenger contact';
  return (
    `${who} already has its own customer record with ${parts.join(', ') || 'data'}.\n\n` +
    `Connecting will MERGE both into ${targetName || 'this account'}: everything moves over.\n\n` +
    'Only continue if you are sure they are the same person. (It can be undone with "Disconnect chat".)'
  );
}

/**
 * Link with a confirm step for account merges. Uses window.confirm so it works
 * the same on iPhone and Huawei browsers.
 */
export async function linkChatToCustomerWithConfirm(
  supabase: SupabaseClient,
  psid: string,
  customerId: string,
  targetName: string | null,
  method: ChatLinkMethod = 'manual'
): Promise<ChatLinkResult> {
  const first = await linkChatToCustomer(supabase, psid, customerId, { method });
  if (first.status !== 'needs_merge') return first;
  if (typeof window === 'undefined' || !window.confirm(describeAccountMerge(first.detail, targetName))) {
    return { status: 'error', message: 'Not connected.' };
  }
  return linkChatToCustomer(supabase, psid, customerId, { method, mergeAccounts: true });
}

export async function unlinkChatFromCustomer(
  supabase: SupabaseClient,
  customerId: string
): Promise<{ ok: true; chatCustomerId: string | null } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('unlink_chat_psid_from_customer', { p_customer_id: customerId });
  if (error) return { ok: false, message: error.message.replace(/^NOT_LINKED:\s*/, '') };
  const result = (data ?? {}) as { chat_customer_id?: string };
  return { ok: true, chatCustomerId: result.chat_customer_id ?? null };
}

/** "Not the same person": saved for everyone, and the webhook stops auto-linking the pair. */
export async function dismissChatMatch(supabase: SupabaseClient, psid: string, customerId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('chat_match_dismissals')
    .insert({ psid, customer_id: customerId, dismissed_by: auth.user?.id ?? null });
  if (error && error.code !== '23505') throw error;
}

/** Auto-link only when the phone number AND the name agree (one candidate only). */
export function isAutoLinkSafe(m: MatchedCustomerCandidate | MatchedChatCandidate): boolean {
  return Boolean(m.phone_match) && (m.name_match === 'exact' || m.name_match === 'similar');
}

export function chatLinkErrorMessage(result: ChatLinkResult): string | null {
  if (result.status === 'has_other_chat' || result.status === 'error') return result.message;
  if (result.status === 'needs_merge') return 'Not connected: this would merge two accounts.';
  return null;
}
