// Staff roles live in Supabase `app_metadata`, which only the server (service-role key)
// can change. Never read roles from `user_metadata`: any logged-in user can edit their
// own user_metadata, so a role there could be self-assigned.
//
// Safe to import from middleware (no Node-only imports).

export const STAFF_ROLES = ['Owner', 'Admin', 'Inventory', 'Sales'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Lower-case staff roles from a Supabase user's app_metadata. Empty = not staff. */
export function staffRolesOf(user: any): string[] {
  const meta = user?.app_metadata || user?.appMetadata;
  if (!meta) return [];
  const raw: unknown[] = Array.isArray(meta.roles) ? meta.roles : meta.role ? [meta.role] : [];
  return raw
    .map((r) => canonical(String(r)))
    .filter((r): r is string => !!r);
}

// Old spellings the dashboard has always accepted for Inventory.
const INVENTORY_ALIASES = ['inventory staff', 'inventory_staff', 'inventory-staff', 'staff'];

function canonical(role: string): string | null {
  const r = role.toLowerCase().trim();
  if (INVENTORY_ALIASES.includes(r)) return 'inventory';
  return STAFF_ROLES.some((s) => s.toLowerCase() === r) ? r : null;
}

/** Same roles, with their display casing ('Admin', 'Inventory', ...). */
export function staffRoleNames(user: any): StaffRole[] {
  const lower = staffRolesOf(user);
  return STAFF_ROLES.filter((s) => lower.includes(s.toLowerCase()));
}

export function isStaffUser(user: any): boolean {
  return staffRolesOf(user).length > 0;
}

/** Turns any list of role strings into clean display-cased staff roles. */
export function normalizeRoles(input: unknown): StaffRole[] {
  const list = Array.isArray(input) ? input : input ? [input] : [];
  const lower = list.map((r) => canonical(String(r)));
  return STAFF_ROLES.filter((s) => lower.includes(s.toLowerCase()));
}
