import type { SupabaseClient } from '@supabase/supabase-js';
import { addOrderNote } from './order-trail-service';

/**
 * Posts a note to an order's centralized notes (Activity & Notes on the order
 * page). Shared by the order page, the Priority List and Ready to Pick so all
 * behave the same. Sending it to someone (pop-up) is done after, with
 * sendOrderNote (useStaffTasks), for the names from `taggedNames` and the
 * "Para kanino?" picks.
 */
export async function postOrderNote(
  supabase: SupabaseClient,
  input: { orderId: string; text: string; authorName: string }
): Promise<{ success: boolean; error?: unknown }> {
  const text = input.text.trim();
  if (!text) return { success: false, error: 'Note text cannot be empty' };
  return addOrderNote(supabase, input.orderId, text, input.authorName);
}

/** Names tagged with @: picked from the dropdown, or "@Full Name" typed by hand. */
export function taggedNames(
  text: string,
  mentions: string[],
  staff: { fullName?: string | null }[],
  authorName: string
): string[] {
  const lower = text.toLowerCase();
  const typed = staff
    .map((s) => s.fullName || '')
    .filter((name) => name && lower.includes(`@${name.toLowerCase()}`));
  const me = authorName.trim().toLowerCase();
  return Array.from(new Set([...mentions, ...typed].map((n) => n.trim()).filter((n) => n && n.toLowerCase() !== me)));
}
