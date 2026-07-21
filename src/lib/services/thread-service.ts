import { SupabaseClient } from '@supabase/supabase-js';

export type StaffIdentity = { userId: string; displayName: string };

/**
 * Sentinel last_read_at for people joined to a thread by someone else's action
 * (an @mention) — everything in the thread counts as unread for them until
 * they actually open it. Joining by sending/reading uses now() instead.
 */
export const NEVER_READ = '1970-01-01T00:00:00Z';

/**
 * Maps staff display names (how mentions and recipients are keyed everywhere
 * else in this codebase) to auth user ids. Case-insensitive on the full name.
 */
export async function getStaffByName(supabase: SupabaseClient): Promise<Map<string, StaffIdentity>> {
  const { data, error } = await supabase.rpc('get_all_users');
  if (error) {
    console.error('Error fetching users for thread membership:', error);
    return new Map();
  }

  const byName = new Map<string, StaffIdentity>();
  for (const u of data || []) {
    const meta = u.raw_user_meta_data || {};
    const fullName = `${meta.first_name || ''} ${meta.last_name || ''}`.trim();
    if (fullName) byName.set(fullName.toLowerCase(), { userId: u.id, displayName: fullName });
  }
  return byName;
}

/**
 * Ensures the given people are members of a thread. Existing rows keep their
 * last_read_at (only is_member may be promoted); new rows get last_read_at =
 * now() for the actor (they've obviously seen what they just sent) and
 * NEVER_READ for everyone else, so the message that pulled them in is unread.
 */
export async function joinThreadMembers(
  supabase: SupabaseClient,
  issueId: string,
  members: StaffIdentity[],
  actorUserId?: string
) {
  if (members.length === 0) return;

  const { data: existing, error: fetchErr } = await supabase
    .from('thread_participants')
    .select('user_id, is_member')
    .eq('issue_id', issueId);
  if (fetchErr) throw fetchErr;

  const existingById = new Map((existing || []).map((r) => [r.user_id, r]));

  const toInsert = members
    .filter((m) => !existingById.has(m.userId))
    .map((m) => ({
      issue_id: issueId,
      user_id: m.userId,
      display_name: m.displayName,
      is_member: true,
      last_read_at: m.userId === actorUserId ? new Date().toISOString() : NEVER_READ,
    }));

  if (toInsert.length > 0) {
    const { error } = await supabase.from('thread_participants').insert(toInsert);
    if (error) throw error;
  }

  const toPromote = members.filter((m) => existingById.get(m.userId)?.is_member === false);
  for (const m of toPromote) {
    const { error } = await supabase
      .from('thread_participants')
      .update({ is_member: true })
      .eq('issue_id', issueId)
      .eq('user_id', m.userId);
    if (error) throw error;
  }
}

/** Upserts the viewer's read marker without touching membership. */
export async function markThreadRead(
  supabase: SupabaseClient,
  issueId: string,
  userId: string,
  displayName: string
) {
  const { data: existing, error: fetchErr } = await supabase
    .from('thread_participants')
    .select('user_id')
    .eq('issue_id', issueId)
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  if (existing) {
    const { error } = await supabase
      .from('thread_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('issue_id', issueId)
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('thread_participants').insert({
      issue_id: issueId,
      user_id: userId,
      display_name: displayName,
      is_member: false,
      last_read_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
}

type MessageLite = { sender_name: string | null; created_at: string };

/**
 * Unread = messages newer than my read marker, not sent by me. No participant
 * row means unread 0 — staff can browse threads they're not involved in
 * without every open issue inflating their badge.
 */
export function countUnread(
  messages: MessageLite[],
  lastReadAt: string | null | undefined,
  myName: string
): number {
  if (!lastReadAt) return 0;
  const cutoff = new Date(lastReadAt).getTime();
  const me = myName.trim().toLowerCase();
  return messages.filter(
    (m) =>
      new Date(m.created_at).getTime() > cutoff &&
      (m.sender_name || '').trim().toLowerCase() !== me
  ).length;
}
