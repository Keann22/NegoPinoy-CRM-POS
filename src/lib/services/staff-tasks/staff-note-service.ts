import { SupabaseClient } from '@supabase/supabase-js';
import { staffRoleNames } from '@/lib/auth/staff-roles';
import type { NewOrderNote, NoteTarget, NoteTeam, StaffTask } from '@/types/staff-tasks.types';
import {
  fullName, getRow, NOTE_UNSEEN_MS, people, SELECT, staffAccounts, TaskError, toTask, withOrderContext,
  type Person, type TaskCaller, type TaskRow,
} from './staff-task-service';

/*
 * Order notes for a person or team (owner, 2026-11-25). Sales wrote requests for
 * the warehouse as order notes and nobody was told. A note sent to someone is a
 * staff_tasks row with kind = 'note': it pops up for them and stays on their
 * dashboard until answered ("Kailangan ng sagot") or seen ("Pasabi lang po").
 * The answer pops up for the sender. Notes go both ways. Server only.
 */

/** Inventory = Jas, Al, Tess, Edric and Rey (owner, 2026-11-25). Change the team here. */
const INVENTORY_TEAM: { label: string; emails: string[] }[] = [
  { label: 'Jas', emails: ['jas@gmail.com', 'jas@usares.com', 'jassy@gmail.com'] },
  { label: 'Al', emails: ['alpinakacute@gmail.com'] },
  { label: 'Tess', emails: ['tess@example.com', 'tessrong@yahoo.com'] },
  { label: 'Edric', emails: ['cedric@gmail.com', 'cedrictimpug@gmail.com'] },
  { label: 'Rey', emails: ['rey.magbitangjr@gmail.com'] },
];

const TEAM_LABEL: Record<NoteTeam, string> = { inventory: 'Inventory', owners: 'Owners' };

interface Team { team: NoteTeam; ids: string[]; names: string }

async function teams(supabase: SupabaseClient): Promise<Team[]> {
  const accounts = await staffAccounts(supabase);
  const byEmail = new Map(accounts.map((u) => [String(u.email || '').toLowerCase(), u.id]));
  const inventoryIds = INVENTORY_TEAM.flatMap((m) => m.emails.map((e) => byEmail.get(e)).filter(Boolean) as string[]);
  const owners = accounts.filter((u) => staffRoleNames(u).some((r) => r === 'Admin' || r === 'Owner'));
  const ownerNames = Array.from(new Set(owners.map((u) => String(u.user_metadata?.first_name || '').trim()).filter(Boolean)));
  return [
    { team: 'inventory', ids: inventoryIds, names: INVENTORY_TEAM.map((m) => m.label).join(', ') },
    { team: 'owners', ids: owners.map((u) => u.id), names: ownerNames.join(', ') },
  ];
}

/** All accounts of the Inventory team (Jas, Al, Tess, Edric, Rey). */
export async function inventoryTeam(supabase: SupabaseClient): Promise<{ ids: string[]; names: string }> {
  const t = (await teams(supabase)).find((x) => x.team === 'inventory')!;
  return { ids: t.ids, names: t.names };
}

async function orderAgent(supabase: SupabaseClient, orderId: string | null, all: Person[]): Promise<Person | null> {
  if (!orderId) return null;
  const { data } = await supabase.from('orders').select('sales_person_name').eq('id', orderId).maybeSingle();
  const name = String(data?.sales_person_name || '').trim().toLowerCase();
  return name ? all.find((p) => p.name.toLowerCase() === name) || null : null;
}

/** "Who is it for?": the teams, the order's sales agent, then everyone else. */
export async function listNoteTargets(supabase: SupabaseClient, orderId: string | null, callerId: string): Promise<NoteTarget[]> {
  const all = await people(supabase);
  const agent = await orderAgent(supabase, orderId, all);
  const targets: NoteTarget[] = (await teams(supabase)).map((t) => ({
    key: `team:${t.team}`, label: TEAM_LABEL[t.team], detail: t.names, kind: 'team',
  }));
  if (agent && !agent.ids.includes(callerId)) {
    targets.push({ key: agent.key, label: agent.name, detail: 'Sales agent of this order', kind: 'agent' });
  }
  for (const p of all) {
    if (p.ids.includes(callerId) || p.key === agent?.key) continue;
    targets.push({ key: p.key, label: p.name, detail: p.roles.join(', '), kind: 'person' });
  }
  return targets;
}

/** Sends an order note to the people and teams picked. One copy per person or team. */
export async function createNote(supabase: SupabaseClient, input: NewOrderNote, caller: TaskCaller): Promise<string[]> {
  const message = String(input.message || '').trim();
  if (!message) throw new TaskError('Write the note first');
  if (message.length > 2000) throw new TaskError('The note is too long (2,000 characters max)');
  const all = await people(supabase);
  const sender = all.find((p) => p.ids.includes(caller.id));
  const senderIds = sender?.ids || [caller.id];
  const notMe = (ids: string[]) => ids.filter((id) => !senderIds.includes(id));

  const rows: { assignee_ids: string[]; assignee_name: string; team: NoteTeam | null }[] = [];
  const keys = new Set(input.targetKeys.map(String));
  for (const t of await teams(supabase)) {
    if (!keys.has(`team:${t.team}`)) continue;
    const ids = notMe(t.ids);
    if (ids.length) rows.push({ assignee_ids: ids, assignee_name: TEAM_LABEL[t.team], team: t.team });
  }
  // @tags are written with any of the person's account names ("Jasmin Urs" is Jas).
  const mentioned = new Set((input.mentionNames || []).map((n) => n.trim().toLowerCase()).filter(Boolean));
  const mentionedIds = new Set(
    mentioned.size ? (await staffAccounts(supabase)).filter((u) => mentioned.has(fullName(u).toLowerCase())).map((u) => u.id) : []
  );
  for (const p of all) {
    const tagged = mentioned.has(p.name.toLowerCase()) || p.ids.some((id) => mentionedIds.has(id));
    if (!keys.has(p.key) && !tagged) continue;
    const ids = notMe(p.ids);
    if (ids.length) rows.push({ assignee_ids: ids, assignee_name: p.name, team: null });
  }
  if (rows.length === 0) throw new TaskError('Pick who should get the note');

  const groupId = rows.length > 1 ? crypto.randomUUID() : null;
  const { data, error } = await supabase
    .from('staff_tasks')
    .insert(rows.map((r) => ({
      ...r,
      kind: 'note',
      message,
      order_id: input.orderId || null,
      needs_answer: input.needsAnswer !== false,
      assigned_by_id: caller.id,
      assigned_by_name: caller.name,
      sender_ids: senderIds,
      group_id: groupId,
    })))
    .select('id');
  if (error) throw error;
  return (data || []).map((r) => r.id as string);
}

/** Notes I wrote: still open, answered in the last 7 days, or with an answer I haven't read. */
export async function listSentNotes(supabase: SupabaseClient, callerId: string): Promise<StaffTask[]> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data, error } = await supabase
    .from('staff_tasks')
    .select(SELECT)
    .eq('kind', 'note')
    .contains('sender_ids', [callerId])
    .or(`status.eq.open,created_at.gte.${since},last_message_at.gte.${since}`)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data || []) as unknown as TaskRow[]).map(toTask);
}

/** Owners: notes nobody has seen 2 hours after they were sent. */
export async function listUnseenNotes(supabase: SupabaseClient): Promise<StaffTask[]> {
  const before = new Date(Date.now() - NOTE_UNSEEN_MS).toISOString();
  const { data, error } = await supabase
    .from('staff_tasks')
    .select(SELECT)
    .eq('kind', 'note')
    .eq('status', 'open')
    .is('seen_at', null)
    .lt('created_at', before)
    .order('created_at')
    .limit(100);
  if (error) throw error;
  return withOrderContext(supabase, ((data || []) as unknown as TaskRow[]).map(toTask));
}

/** The sender read the answer, or saw "not seen in 2 hours". */
export async function ackNote(supabase: SupabaseClient, id: string, caller: TaskCaller): Promise<void> {
  const row = await getRow(supabase, id);
  if (row.kind !== 'note' || !(row.sender_ids || []).includes(caller.id)) throw new TaskError('This note is not yours');
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('staff_tasks')
    .update({ owner_read_at: now, ...(row.seen_at ? {} : { sender_nudged_at: now }) })
    .eq('id', id);
  if (error) throw error;
}
