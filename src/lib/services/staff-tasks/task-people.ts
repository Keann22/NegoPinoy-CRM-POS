import { SupabaseClient } from '@supabase/supabase-js';
import { staffRoleNames } from '@/lib/auth/staff-roles';
import type { TaskPerson } from '@/types/staff-tasks.types';

/** Accounts that are one person (Jas has three). Everyone else: same full name = same person. */
const SAME_PERSON: { label: string; emails: string[] }[] = [
  { label: 'Jas', emails: ['jas@gmail.com', 'jas@usares.com', 'jassy@gmail.com'] },
];

export interface AuthUser {
  id: string;
  email?: string;
  app_metadata?: unknown;
  user_metadata?: Record<string, unknown>;
  last_sign_in_at?: string | null;
}

export type Person = TaskPerson & { ids: string[]; lastSignIn: string };

export function fullName(u: AuthUser): string {
  const m = u.user_metadata || {};
  return `${m.first_name || ''} ${m.last_name || ''}`.trim() || u.email || 'Staff';
}

export async function staffAccounts(supabase: SupabaseClient): Promise<AuthUser[]> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return (data.users as AuthUser[]).filter((u) =>
    staffRoleNames(u).length > 0 && !String(u.email || '').toLowerCase().endsWith('.test'));
}

/** Staff to assign to, most recently active first. */
export async function people(supabase: SupabaseClient): Promise<Person[]> {
  const groups = new Map<string, { label: string; known: boolean; users: AuthUser[] }>();
  for (const u of await staffAccounts(supabase)) {
    const email = String(u.email || '').toLowerCase();
    const known = SAME_PERSON.find((g) => g.emails.includes(email));
    const groupKey = known ? `known:${known.label}` : `name:${fullName(u).toLowerCase()}`;
    const g = groups.get(groupKey) || { label: known?.label || fullName(u), known: !!known, users: [] };
    g.users.push(u);
    groups.set(groupKey, g);
  }
  return Array.from(groups.values())
    .map(({ label, known, users }) => {
      const ids = users.map((u) => u.id).sort();
      // Same-name accounts: show the name as written on the most recently used one.
      const latest = [...users].sort((x, y) => String(y.last_sign_in_at || '').localeCompare(String(x.last_sign_in_at || '')))[0];
      const name = known ? label : fullName(latest);
      const roles = Array.from(new Set(users.flatMap((u) => staffRoleNames(u))));
      const lastSignIn = users.map((u) => u.last_sign_in_at || '').sort().pop() || '';
      return { key: ids.join(','), name, roles, ids, lastSignIn };
    })
    .sort((a, b) => b.lastSignIn.localeCompare(a.lastSignIn));
}

export async function listPeople(supabase: SupabaseClient): Promise<TaskPerson[]> {
  return (await people(supabase)).map(({ key, name, roles }) => ({ key, name, roles }));
}

/** Owner (Admin) names, for bells about automatic tasks nobody assigned by hand. */
export async function ownerNames(supabase: SupabaseClient): Promise<string[]> {
  const owners = (await staffAccounts(supabase)).filter((u) =>
    staffRoleNames(u).some((r) => r === 'Admin' || r === 'Owner'));
  return Array.from(new Set(owners.map(fullName)));
}
