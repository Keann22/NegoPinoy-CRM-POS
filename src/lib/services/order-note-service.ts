import type { SupabaseClient } from '@supabase/supabase-js';
import { createStaffMessage, resolveRecipientNames } from './staff-message-service';
import { addOrderNote } from './order-trail-service';

/**
 * Posts a note to an order's centralized notes (Activity & Notes on the order
 * page). Anyone @tagged also gets a message thread + notification. Shared by
 * the order page and the Priority List so both behave the same.
 */
export async function postOrderNote(
  supabase: SupabaseClient,
  input: {
    orderId: string;
    text: string;
    authorName: string;
    /** Names picked from the @ dropdown. */
    mentions: string[];
    /** Staff directory, to also catch @Full Name typed by hand. */
    staff: { fullName?: string | null }[];
  }
): Promise<{ success: boolean; error?: any }> {
  const text = input.text.trim();
  if (!text) return { success: false, error: 'Note text cannot be empty' };

  const lower = text.toLowerCase();
  const typed = input.staff
    .map((s) => s.fullName || '')
    .filter((name) => name && lower.includes(`@${name.toLowerCase()}`));
  const tagged = resolveRecipientNames([...input.mentions, ...typed], input.authorName);

  if (tagged.length > 0) {
    await createStaffMessage(supabase, {
      issueType: 'order',
      orderId: input.orderId,
      message: text,
      senderName: input.authorName,
      recipientNames: tagged,
      title: `${input.authorName} tagged you in a note on Order #${input.orderId.substring(0, 7).toUpperCase()}`,
    });
  }

  return addOrderNote(supabase, input.orderId, text, input.authorName);
}
