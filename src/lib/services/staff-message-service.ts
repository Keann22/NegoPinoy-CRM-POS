import { SupabaseClient } from '@supabase/supabase-js';

export type StaffMessageInput = {
  issueType: 'order' | 'product';
  orderId?: string;
  productId?: string;
  message: string;
  senderName: string;
  senderRole?: string;
  recipientNames: string[];
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
  { senderName, message }: { senderName: string; message: string }
) {
  if (recipientNames.length === 0) return;

  const notificationRows = recipientNames.map((name) => ({
    sales_person_name: name,
    title: `New message from ${senderName}`,
    message: message.length > 140 ? `${message.slice(0, 140)}...` : message,
    link: '/dashboard',
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
  const { issueType, orderId, productId, message, senderName, senderRole, recipientNames } = input;

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
      mentions: recipientNames,
    });

  if (msgErr) throw msgErr;

  await fanOutStaffNotifications(supabase, recipientNames, { senderName, message });

  return issue.id as string;
}
