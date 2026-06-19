/**
 * user.types.ts
 * Centralized user and role type definitions.
 * All components and hooks must import user types from here.
 */

export type UserRole = 'Owner' | 'Admin' | 'Sales' | 'Inventory';

export type UserProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roles: UserRole[];
};

export type AuthUser = {
  uid: string;
  email?: string;
  photoURL?: string;
  userMetadata?: Record<string, any>;
};

/** Helper: check if a user has management-level access (Owner or Admin) */
export function isManagementRole(roles: UserRole[]): boolean {
  return roles.some(r => ['Owner', 'Admin'].includes(r));
}

/** Helper: check if a user has sales access */
export function isSalesRole(roles: UserRole[]): boolean {
  return roles.some(r => r === 'Sales');
}

/** Helper: check if a user has inventory access */
export function isInventoryRole(roles: UserRole[]): boolean {
  return roles.some(r => r === 'Inventory');
}
