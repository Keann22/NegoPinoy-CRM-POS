import { SupabaseClient } from '@supabase/supabase-js';
import { getStaffByName, joinThreadMembers, type StaffIdentity } from '@/lib/services/thread-service';

export type StaffMessageInput = {
  issueType: 'order' | 'product';
  orderId?: string;
  productId?: string;
  message: string;
  senderName: string;
  senderRole?: string;
  recipientNames: string[];
  /** Optional per-recipient notification link (keyed by recipient name), e.g. each rep's affected order. */
  linkByRecipient?: Map<string, string>;
};

// Always tagged on staff/inventory escalations, regardless of which staff
// member currently fills the "handles purchasing" seat — named explicitly
// rather than by role because it's specifically these two people, not
// "Inventory" at large. Kept as both since it wasn't clear which is active.
export const ALWAYS_NOTIFY_NAMES = ['Jas Urs', 'Jasmin Urs'];

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Admin-role staff (via get_all_users) + the always-notify names, deduped. */
export async function getAdminAndInventoryLeadNames(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_all_users');
  if (error) {
    console.error('Error fetching users for staff-message routing:', error);
    return dedupeNames([...ALWAYS_NOTIFY_NAMES]);
  }

  const adminNames = (data || [])
    .filter((u: any) => {
      const meta = u.raw_user_meta_data || {};
      const roles = Array.isArray(meta.roles) ? meta.roles : (meta.role ? [meta.role] : []);
      return roles.some((r: string) => String(r).toLowerCase() === 'admin');
    })
    .map((u: any) => {
      const meta = u.raw_user_meta_data || {};
      return `${meta.first_name || ''} ${meta.last_name || ''}`.trim();
    })
    .filter(Boolean);

  return dedupeNames([...adminNames, ...ALWAYS_NOTIFY_NAMES]);
}

/** Case-insensitive de-dupe that also drops a name (e.g. the sender) from the list. */
export function resolveRecipientNames(names: string[], excludeName?: string): string[] {
  const excludeKey = excludeName?.trim().toLowerCase();
  return dedupeNames(names).filter((name) => name.trim().toLowerCase() !== excludeKey);
}

/** Fans out one notifications row per recipient (source: 'staff_message'), each independently read/unread. */
export async function fanOutStaffNotifications(
  supabase: SupabaseClient,
  recipientNames: string[],
  { senderName, message, title, link, linkByRecipient }: {
    senderName: string;
    message: string;
    title?: string;
    link?: string;
    /** Per-recipient link (keyed by recipient name); falls back to `link` for names not in the map. */
    linkByRecipient?: Map<string, string>;
  }
) {
  if (recipientNames.length === 0) return;

  // Name matching is case-insensitive, consistent with dedupeNames/resolveRecipientNames
  const linkLookup = new Map<string, string>();
  linkByRecipient?.forEach((value, name) => linkLookup.set(name.trim().toLowerCase(), value));

  const notificationRows = recipientNames.map((name) => ({
    sales_person_name: name,
    title: title || `New message from ${senderName}`,
    message: message.length > 140 ? `${message.slice(0, 140)}...` : message,
    link: linkLookup.get(name.trim().toLowerCase()) || link || '/dashboard',
    is_read: false,
    source: 'staff_message',
  }));

  const { error } = await supabase.from('notifications').insert(notificationRows);
  if (error) throw error;
}

/**
 * Creates a staff_message-type order_issues thread, posts the initial
 * order_issue_messages row (mentions = recipientNames, so the Inbox Drawer's
 * urgent toast fires for them), and fans out one notifications row per
 * recipient so each gets their own independently read/unread Bell entry.
 */
export async function createStaffMessage(supabase: SupabaseClient, input: StaffMessageInput) {
  const { issueType, orderId, productId, message, senderName, senderRole, recipientNames, linkByRecipient } = input;

  // For an order-scoped message, always loop in the order's own sales rep — the
  // person actually affected by that order — even if the sender didn't tag them.
  // Deduped case-insensitively and never the sender themselves.
  let recipients = recipientNames;
  if (issueType === 'order' && orderId) {
    const { data: orderRow } = await supabase
      .from('orders')
      .select('sales_person_name')
      .eq('id', orderId)
      .maybeSingle();
    const repName = orderRow?.sales_person_name?.trim();
    if (
      repName &&
      repName.toLowerCase() !== senderName.trim().toLowerCase() &&
      !recipients.some((n) => n.trim().toLowerCase() === repName.toLowerCase())
    ) {
      recipients = [...recipients, repName];
    }
  }

  const { data: issue, error: issueErr } = await supabase
    .from('order_issues')
    .insert({
      order_id: issueType === 'order' ? orderId : null,
      product_id: issueType === 'product' ? productId : null,
      issue_type: 'staff_message',
      status: 'open',
      reported_by_name: senderName,
    })
    .select('id')
    .single();

  if (issueErr) throw issueErr;

  const { error: msgErr } = await supabase
    .from('order_issue_messages')
    .insert({
      issue_id: issue.id,
      sender_role: senderRole || 'staff',
      sender_name: senderName,
      message,
      requires_attention: true,
      mentions: recipients,
    });

  if (msgErr) throw msgErr;

  // Register sender + recipients as thread members so the Messages page shows
  // them as involved and tracks their unread state. Names that can't be
  // resolved to a user id (system senders like 'Picker') are skipped.
  try {
    const staffByName = await getStaffByName(supabase);
    const members: StaffIdentity[] = [];
    for (const name of [senderName, ...recipients]) {
      const match = staffByName.get(name.trim().toLowerCase());
      if (match && !members.some((m) => m.userId === match.userId)) members.push(match);
    }
    const sender = staffByName.get(senderName.trim().toLowerCase());
    await joinThreadMembers(supabase, issue.id, members, sender?.userId);
  } catch (e) {
    console.error('Error registering thread members (message still sent):', e);
  }

  // Order-type staff messages always link to the order itself
  const link = issueType === 'order' && orderId ? `/dashboard/orders/${orderId}` : undefined;
  await fanOutStaffNotifications(supabase, recipients, { senderName, message, link, linkByRecipient });

  return issue.id as string;
}
