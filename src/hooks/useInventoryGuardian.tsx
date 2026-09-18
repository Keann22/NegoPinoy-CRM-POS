'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import type { InventoryAnomaly, InventoryGuardianMemoryEntry, GuardianDailyProgress } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useRoleCheck } from '@/hooks/useRoleCheck';

const SNOOZE_KEY = 'guardian_modal_snoozed_at';
const SNOOZE_MS = 15 * 60 * 1000; // 15 minutes

const EXCLUDED_GUARDIAN_EMAILS = new Set([
  'cedric@gmail.com',
  'cedrictimpug@gmail.com',
  'rey.magbitangjr@gmail.com',
  'duornos@gmail.com'
]);

export function isUserAllowedGuardian(email?: string, roles?: string[]): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  // Rey has a temporary special assignment for today (30-item shelf check)
  if (normalized === 'rey.magbitangjr@gmail.com') return true;
  if (EXCLUDED_GUARDIAN_EMAILS.has(normalized)) return false;
  return Boolean(roles?.some(r => ['Admin', 'Owner', 'Inventory'].includes(r)));
}

interface GuardianContextValue {
  canAccess: boolean;
  anomalies: InventoryAnomaly[];
  allAnomalies: InventoryAnomaly[];
  dailyProgress: GuardianDailyProgress | null;
  showAllBacklog: boolean;
  setShowAllBacklog: (show: boolean) => void;
  totalAnomaliesCount: number;
  totalBacklogCount: number;
  isLoading: boolean;
  fetchAnomalies: () => Promise<void>;
  dismissAnomaly: (id: string) => void;
  resolvePhysicalCount: (productId: string, physicalShelfCount: number, notes?: string) => Promise<any>;
  resolveBackfillPurchase: (productId: string, quantity: number, unitCost: number, supplierName?: string) => Promise<any>;
  resolveBorrowStock: (productId: string, quantity: number, orderId?: string, notes?: string) => Promise<any>;
  fetchProductMemory: (productId: string) => Promise<InventoryGuardianMemoryEntry[]>;
  // Modal control (shared so the trigger badge and the modal stay in sync)
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const GuardianContext = createContext<GuardianContextValue | null>(null);

/**
 * Provider that owns a SINGLE copy of the Inventory Guardian state (anomalies +
 * modal open state). Rendered once near the dashboard root so the shield badge
 * and the alert modal share one fetch and one source of truth.
 */
export function InventoryGuardianProvider({ children }: { children: ReactNode }) {
  const [anomalies, setAnomalies] = useState<InventoryAnomaly[]>([]);
  const [allAnomalies, setAllAnomalies] = useState<InventoryAnomaly[]>([]);
  const [dailyProgress, setDailyProgress] = useState<GuardianDailyProgress | null>(null);
  const [showAllBacklog, setShowAllBacklog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const canAccess = useMemo(() => {
    return isUserAllowedGuardian(userProfile?.email, userProfile?.roles);
  }, [userProfile]);

  const userName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Staff';

  const fetchAnomalies = useCallback(async () => {
    if (!canAccess) {
      setAnomalies([]);
      setAllAnomalies([]);
      setDailyProgress(null);
      return;
    }
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (userProfile?.email) params.set('userEmail', userProfile.email);
      if (userName) params.set('userName', userName);
      if (userProfile?.id) params.set('userId', userProfile.id);
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/inventory/guardian/anomalies${queryStr}`);
      if (!res.ok) throw new Error('Failed to fetch inventory anomalies');
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.anomalies)) setAnomalies(data.anomalies);
        if (Array.isArray(data.allAnomalies)) setAllAnomalies(data.allAnomalies);
        if (data.dailyProgress) setDailyProgress(data.dailyProgress);
      }
    } catch (err: any) {
      console.error('Error fetching inventory anomalies:', err);
    } finally {
      setIsLoading(false);
    }
  }, [canAccess, userProfile?.email, userName, userProfile?.id]);

  useEffect(() => {
    if (canAccess) {
      fetchAnomalies();
    }
  }, [canAccess, fetchAnomalies]);

  const currentList = showAllBacklog ? allAnomalies : anomalies;
  const activeAnomalies = currentList.filter(a => !dismissedIds.has(a.id));
  const totalAnomaliesCount = activeAnomalies.length;
  const totalBacklogCount = allAnomalies.filter(a => !dismissedIds.has(a.id)).length;

  const openModal = useCallback(() => {
    if (!canAccess) return;
    // An explicit open (clicking the shield) clears any snooze so the modal shows.
    try { sessionStorage.removeItem(SNOOZE_KEY); } catch {}
    setIsModalOpen(true);
  }, [canAccess]);

  const closeModal = useCallback(() => {
    // Treat any close (X / Escape / outside click / snooze button) as a 15-min snooze.
    // This is what prevents the auto-open effect from immediately re-opening the modal.
    try { sessionStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch {}
    setIsModalOpen(false);
  }, []);

  // Auto-open ONCE when anomalies first appear for allowed staff, unless snoozed, or daily goal already met.
  // Guarded by hasAutoOpened + the snooze timestamp so closing the modal never traps the user.
  useEffect(() => {
    if (hasAutoOpened) return;
    if (!canAccess) return;
    if (dailyProgress?.isGoalMet || dailyProgress?.isRestDay) return; // Daily goal achieved or Sunday rest day!
    if (totalAnomaliesCount === 0) return;

    let isSnoozed = false;
    try {
      const snoozedAt = sessionStorage.getItem(SNOOZE_KEY);
      isSnoozed = !!snoozedAt && Date.now() - Number(snoozedAt) < SNOOZE_MS;
    } catch {}

    if (!isSnoozed) {
      setIsModalOpen(true);
    }
    setHasAutoOpened(true);
  }, [totalAnomaliesCount, canAccess, hasAutoOpened, dailyProgress]);

  const dismissAnomaly = (id: string) => {
    setDismissedIds(prev => new Set(prev).add(id));
  };

  const resolvePhysicalCount = async (productId: string, physicalShelfCount: number, notes?: string) => {
    try {
      const res = await fetch('/api/inventory/guardian/anomalies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_physical_count',
          payload: { productId, physicalShelfCount, notes, actorName: userName, actorId: userProfile?.id }
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to update physical count');

      toast({
        title: 'Physical Stock Updated',
        description: `Verified shelf count set to ${physicalShelfCount} (ledger stock: ${data.newStockLevel}).`
      });

      setAnomalies(prev => prev.filter(a => a.productId !== productId));
      return data;
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: err.message });
      throw err;
    }
  };

  const resolveBackfillPurchase = async (productId: string, quantity: number, unitCost: number, supplierName?: string) => {
    try {
      const res = await fetch('/api/inventory/guardian/anomalies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'backfill_purchase',
          payload: { productId, quantity, unitCost, supplierName, actorName: userName, actorId: userProfile?.id }
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to backfill purchase');

      toast({
        title: 'Purchase Backfilled',
        description: `Added ${quantity} units to inventory at ₱${unitCost}. New stock level: ${data.newStockLevel}.`
      });

      setAnomalies(prev => prev.filter(a => a.productId !== productId));
      return data;
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Save Failed', description: err.message });
      throw err;
    }
  };

  const resolveBorrowStock = async (productId: string, quantity: number, orderId?: string, notes?: string) => {
    try {
      const res = await fetch('/api/inventory/guardian/anomalies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'borrow_stock',
          payload: { productId, quantity, orderId, notes, actorName: userName, actorId: userProfile?.id }
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to record borrowed stock');

      toast({
        title: 'Stock Tagged as Borrowed',
        description: `${quantity} unit(s) tagged as borrowed for Order #${(orderId || '').slice(0, 8)}. Procurement alert preserved.`
      });

      setAnomalies(prev => prev.filter(a => a.productId !== productId));
      return data;
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Tagging Failed', description: err.message });
      throw err;
    }
  };

  const fetchProductMemory = useCallback(async (productId: string): Promise<InventoryGuardianMemoryEntry[]> => {
    try {
      const res = await fetch(`/api/inventory/guardian/memory?productId=${encodeURIComponent(productId)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.success && Array.isArray(data.memory) ? data.memory : [];
    } catch (err) {
      console.error('Error fetching product guardian memory:', err);
      return [];
    }
  }, []);

  const value: GuardianContextValue = {
    canAccess,
    anomalies: activeAnomalies,
    allAnomalies,
    dailyProgress,
    showAllBacklog,
    setShowAllBacklog,
    totalAnomaliesCount,
    totalBacklogCount,
    isLoading,
    fetchAnomalies,
    dismissAnomaly,
    resolvePhysicalCount,
    resolveBackfillPurchase,
    resolveBorrowStock,
    fetchProductMemory,
    isModalOpen,
    openModal,
    closeModal
  };

  return <GuardianContext.Provider value={value}>{children}</GuardianContext.Provider>;
}

/**
 * Access the shared Inventory Guardian state. Must be used within an
 * <InventoryGuardianProvider>. Returns a safe no-op shape if the provider is
 * absent so a stray consumer never crashes the dashboard.
 */
export function useInventoryGuardian(): GuardianContextValue {
  const ctx = useContext(GuardianContext);
  if (!ctx) {
    return {
      canAccess: false,
      anomalies: [],
      allAnomalies: [],
      dailyProgress: null,
      showAllBacklog: false,
      setShowAllBacklog: () => {},
      totalAnomaliesCount: 0,
      totalBacklogCount: 0,
      isLoading: false,
      fetchAnomalies: async () => {},
      dismissAnomaly: () => {},
      resolvePhysicalCount: async () => {},
      resolveBackfillPurchase: async () => {},
      resolveBorrowStock: async () => {},
      fetchProductMemory: async () => [],
      isModalOpen: false,
      openModal: () => {},
      closeModal: () => {}
    };
  }
  return ctx;
}
