'use client';
import { useMemo } from 'react';
import { useUserProfile, type UserProfile } from '@/hooks/useUserProfile';

/**
 * Accounts that may change product prices and type a custom price on an order,
 * in addition to Admin/Owner. Everyone else picks from the product's price list.
 */
export const PRICE_MANAGER_EMAILS = ['jas@gmail.com', 'jas@usares.com'];

export function canManagePricesFor(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.roles.some((r: string) => ['Admin', 'Owner'].includes(r))) return true;
  return PRICE_MANAGER_EMAILS.includes(profile.email.toLowerCase().trim());
}

export function useRoleCheck() {
  const { userProfile, isLoading } = useUserProfile();

  const roles = useMemo(() => {
    const userRoles = userProfile?.roles || [];

    const isManagement = userRoles.some((r: string) => ['Admin', 'Owner'].includes(r));
    const isSales = userRoles.some((r: string) => ['Admin', 'Owner', 'Sales'].includes(r));
    const isInventory = userRoles.some((r: string) => ['Admin', 'Owner', 'Inventory'].includes(r));
    const isInventoryOnly = userRoles.length === 1 && userRoles[0] === 'Inventory';
    const canCreateOrder = isSales || isManagement;
    const canManageInventory = isManagement || isInventory;
    const canManageProducts = isManagement || isInventory;
    const canManagePrices = canManagePricesFor(userProfile);

    return { isManagement, isSales, isInventory, isInventoryOnly, canCreateOrder, canManageInventory, canManageProducts, canManagePrices };
  }, [userProfile]);

  return { ...roles, userProfile, isLoading };
}
