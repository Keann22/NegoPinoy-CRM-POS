import type { SupabaseClient } from '@supabase/supabase-js';
import { staffRoleNames } from '@/lib/auth/staff-roles';
import { fullName, staffAccounts, type AuthUser } from '@/lib/services/staff-tasks/task-people';
import type { StaffActivityPersonOption } from '@/types';

/** Accounts belonging to the same person (Jas has three). */
const SAME_PERSON: { label: string; emails: string[] }[] = [
  { label: 'Jas', emails: ['jas@gmail.com', 'jas@usares.com', 'jassy@gmail.com'] },
];

export interface ActivityPerson {
  key: string;
  name: string;
  roles: string[];
  isInventoryTeam: boolean;
  isManagement: boolean;
  lastSignIn: string;
  ids: Set<string>;
  aliases: Set<string>;
}

export type ActivityTarget =
  | { mode: 'all_inventory' }
  | { mode: 'person'; person: ActivityPerson };

export function normName(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function isSystemActor(name: string | null | undefined): boolean {
  const n = normName(name);
  if (!n) return true;
  return (
    n.startsWith('system') ||
    n === 'admin correction' ||
    n === 'owner' ||
    n.startsWith('owner (')
  );
}

/** Strips any accidental currency or cost mentions from reason strings. */
export function sanitizeReason(reason: string | null | undefined): string | null {
  const raw = String(reason || '').trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/₱\s*[\d,]+(?:\.\d+)?/g, '')
    .replace(/\bPHP\s*[\d,]+(?:\.\d+)?/gi, '')
    .replace(/\b(?:unit\s*)?cost\s*[:=]\s*[\d,]+(?:\.\d+)?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || null;
}

export interface ActivityDirectory {
  people: ActivityPerson[];
  options: StaffActivityPersonOption[];
  findByUserId: (userId: string) => ActivityPerson | null;
  findByKey: (key: string) => ActivityPerson | null;
  findByActor: (actor: { id?: string | null; name?: string | null }) => ActivityPerson | null;
  matchesTarget: (
    target: ActivityTarget,
    actor: { id?: string | null; name?: string | null }
  ) => { matched: boolean; displayName: string };
}

/**
 * Builds a multi-account staff directory matching `task-people.ts` grouping,
 * while retaining every account's full name & email alias so historical logs
 * from any of a person's accounts resolve cleanly to one person.
 */
export async function buildActivityDirectory(supabase: SupabaseClient): Promise<ActivityDirectory> {
  const accounts = await staffAccounts(supabase);
  const groups = new Map<string, { label: string; known: boolean; users: AuthUser[] }>();

  for (const u of accounts) {
    const email = String(u.email || '').toLowerCase();
    const known = SAME_PERSON.find((g) => g.emails.includes(email));
    const groupKey = known ? `known:${known.label}` : `name:${normName(fullName(u))}`;
    const existing = groups.get(groupKey) || {
      label: known?.label || fullName(u),
      known: !!known,
      users: [],
    };
    existing.users.push(u);
    groups.set(groupKey, existing);
  }

  const peopleList: ActivityPerson[] = Array.from(groups.values())
    .map(({ label, known, users }) => {
      const idsList = users.map((u) => u.id).sort();
      const latest = [...users].sort((a, b) =>
        String(b.last_sign_in_at || '').localeCompare(String(a.last_sign_in_at || ''))
      )[0];
      const name = known ? label : fullName(latest).trim().replace(/\s+/g, ' ');
      const roles = Array.from(new Set(users.flatMap((u) => staffRoleNames(u))));
      const isInventoryTeam = roles.includes('Inventory');
      const isManagement = roles.includes('Owner') || roles.includes('Admin');
      const lastSignIn = users.map((u) => u.last_sign_in_at || '').sort().pop() || '';

      const aliases = new Set<string>([normName(name)]);
      for (const u of users) {
        const fn = normName(fullName(u));
        if (fn) aliases.add(fn);
        const em = normName(u.email);
        if (em) aliases.add(em);
      }

      return {
        key: idsList.join(','),
        name,
        roles,
        isInventoryTeam,
        isManagement,
        lastSignIn,
        ids: new Set(idsList),
        aliases,
      };
    })
    .sort((a, b) => {
      if (a.isInventoryTeam !== b.isInventoryTeam) return a.isInventoryTeam ? -1 : 1;
      return b.lastSignIn.localeCompare(a.lastSignIn);
    });

  const byId = new Map<string, ActivityPerson>();
  const byKey = new Map<string, ActivityPerson>();
  const byAlias = new Map<string, ActivityPerson>();

  for (const person of peopleList) {
    byKey.set(person.key, person);
    for (const id of person.ids) byId.set(id, person);
    for (const alias of person.aliases) {
      if (!byAlias.has(alias)) byAlias.set(alias, person);
    }
  }

  const findByUserId = (userId: string): ActivityPerson | null => byId.get(userId) || null;
  const findByKey = (key: string): ActivityPerson | null => byKey.get(key) || null;

  const findByActor = (actor: { id?: string | null; name?: string | null }): ActivityPerson | null => {
    if (actor.id && byId.has(actor.id)) return byId.get(actor.id)!;
    const n = normName(actor.name);
    if (n && byAlias.has(n)) return byAlias.get(n)!;
    return null;
  };

  const matchesTarget = (
    target: ActivityTarget,
    actor: { id?: string | null; name?: string | null }
  ): { matched: boolean; displayName: string } => {
    if (!actor.id && isSystemActor(actor.name)) {
      return { matched: false, displayName: '' };
    }
    const resolved = findByActor(actor);

    if (target.mode === 'person') {
      if (resolved) {
        return {
          matched: resolved.key === target.person.key,
          displayName: resolved.name,
        };
      }
      const n = normName(actor.name);
      const matched =
        (!!actor.id && target.person.ids.has(actor.id)) ||
        (!!n && target.person.aliases.has(n));
      return { matched, displayName: target.person.name };
    }

    // 'all_inventory': include all Inventory-role team members (and exclude pure Sales edits)
    if (resolved) {
      return {
        matched: resolved.isInventoryTeam,
        displayName: resolved.name,
      };
    }
    return { matched: false, displayName: '' };
  };

  const options: StaffActivityPersonOption[] = peopleList.map((p) => ({
    key: p.key,
    name: p.name,
    roles: p.roles,
    isInventoryTeam: p.isInventoryTeam,
  }));

  return { people: peopleList, options, findByUserId, findByKey, findByActor, matchesTarget };
}
