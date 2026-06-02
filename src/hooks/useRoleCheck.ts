'use client';
import { useMemo } from 'react';
import { useUserProfile } from '@/hooks/useUserProfile';

export function useRoleCheck() {
  const { userProfile, isLoading } = useUserProfile();

  const roles = useMemo(() => {
    const userRoles = userProfile?.roles || [];
    
    const isManagement = userRoles.some((r: string) => ['Admin', 'Owner'].includes(r));
    const isSales = userRoles.some((r: string) => ['Admin', 'Owner', 'Sales'].includes(r));
    const isInventory = userRoles.some((r: string) => ['Admin', 'Owner', 'Inventory'].includes(r));
    const isInventoryOnly = userRoles.length === 1 && userRoles[0] === 'Inventory';
    const canCreateOrder = isSales || isManagement;

    return { isManagement, isSales, isInventory, isInventoryOnly, canCreateOrder };
  }, [userProfile]);

  return { ...roles, userProfile, isLoading };
}
