'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  CustomerProfile,
  CustomerProfileListItem,
  CustomerProfileMeta,
  CustomerProfileResponse,
  PersonaType,
  StaffProfileVerdict,
} from '@/types';

interface UseCustomerPersonaParams {
  customerId?: string | null;
  psid?: string | null;
}

const EMPTY_META: CustomerProfileMeta = {
  isStale: false,
  newOrdersCount: 0,
  newMessagesCount: 0,
  within24hWindow: false,
};

// Track which customer keys already triggered an automatic background refresh in this session.
const autoRefreshedKeys = new Set<string>();

export function useCustomerPersona({ customerId, psid }: UseCustomerPersonaParams) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [meta, setMeta] = useState<CustomerProfileMeta>(EMPTY_META);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey = useMemo(() => {
    if (customerId) return `customerId=${encodeURIComponent(customerId)}`;
    if (psid) return `psid=${encodeURIComponent(psid)}`;
    return null;
  }, [customerId, psid]);

  const generate = useCallback(async () => {
    if (!customerId && !psid) return null;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/customers/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: customerId || undefined, psid: psid || undefined }),
      });
      const data = (await res.json()) as CustomerProfileResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not generate persona');
      setProfile(data.profile ?? null);
      setMeta(data.meta ?? EMPTY_META);
      return data.profile ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not generate persona';
      setError(msg);
      return null;
    } finally {
      setGenerating(false);
    }
  }, [customerId, psid]);

  const reload = useCallback(async () => {
    if (!queryKey) {
      setProfile(null);
      setMeta(EMPTY_META);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/profile?${queryKey}`, { cache: 'no-store' });
      const data = (await res.json()) as CustomerProfileResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to load customer persona');
      setProfile(data.profile ?? null);
      setMeta(data.meta ?? EMPTY_META);

      const shouldAutoRefresh =
        Boolean(data.profile && data.meta?.isStale) ||
        Boolean(!data.profile && customerId);
      if (shouldAutoRefresh && !autoRefreshedKeys.has(queryKey)) {
        autoRefreshedKeys.add(queryKey);
        void generate();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load persona');
    } finally {
      setLoading(false);
    }
  }, [queryKey, customerId, generate]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submitFeedback = useCallback(
    async (input: {
      verdict: StaffProfileVerdict;
      personaType?: PersonaType;
      correctionNote?: string | null;
    }) => {
      const targetCustomerId = profile?.customerId || customerId;
      if (!targetCustomerId) return false;
      setSavingFeedback(true);
      setError(null);
      try {
        const res = await fetch('/api/customers/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: targetCustomerId,
            verdict: input.verdict,
            personaType: input.personaType,
            correctionNote: input.correctionNote ?? null,
          }),
        });
        const data = (await res.json()) as { profile?: CustomerProfile; error?: string };
        if (!res.ok) throw new Error(data.error || 'Could not save feedback');
        if (data.profile) setProfile(data.profile);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save feedback');
        return false;
      } finally {
        setSavingFeedback(false);
      }
    },
    [profile?.customerId, customerId]
  );

  return {
    profile,
    meta,
    loading,
    generating,
    savingFeedback,
    error,
    generate,
    submitFeedback,
    reload,
  };
}

interface ProfileIndexResponse {
  profiles: CustomerProfileListItem[];
  countsByPersona: Record<string, number>;
  totalProfiled: number;
  worthMessagingCount: number;
  error?: string;
}

export function useCustomerProfileIndex() {
  const [profiles, setProfiles] = useState<CustomerProfileListItem[]>([]);
  const [countsByPersona, setCountsByPersona] = useState<Record<string, number>>({});
  const [totalProfiled, setTotalProfiled] = useState(0);
  const [worthMessagingCount, setWorthMessagingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [batchRunning, setBatchRunning] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/customers/profile?view=list', { cache: 'no-store' });
      const data = (await res.json()) as ProfileIndexResponse;
      if (!res.ok) throw new Error(data.error || 'Failed to load profile index');
      setProfiles(data.profiles || []);
      setCountsByPersona(data.countsByPersona || {});
      setTotalProfiled(data.totalProfiled || 0);
      setWorthMessagingCount(data.worthMessagingCount || 0);
    } catch (err) {
      console.error('useCustomerProfileIndex error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const byCustomerId = useMemo(() => {
    const map = new Map<string, CustomerProfileListItem>();
    for (const p of profiles) map.set(p.customerId, p);
    return map;
  }, [profiles]);

  const runBatch = useCallback(
    async (limit = 5) => {
      setBatchRunning(true);
      try {
        const res = await fetch('/api/customers/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'batch', limit }),
        });
        const data = (await res.json()) as {
          generated: number;
          failed: number;
          totalAttempted: number;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || 'Batch run failed');
        await reload();
        return data;
      } finally {
        setBatchRunning(false);
      }
    },
    [reload]
  );

  return {
    profiles,
    byCustomerId,
    countsByPersona,
    totalProfiled,
    worthMessagingCount,
    loading,
    batchRunning,
    runBatch,
    reload,
  };
}
