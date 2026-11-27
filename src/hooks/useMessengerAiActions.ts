'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  CopilotActionPayload,
  MessengerAiAction,
  MessengerAiActionType,
  MessengerAiDashboardData,
  MessengerAiErrorCategory,
  MessengerAiVerdict,
} from '@/types';

const POPUP_REFRESH_MS = 90_000;

export function useMessengerAiPopup() {
  const [actions, setActions] = useState<MessengerAiAction[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/messenger-ai?view=popup', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { actions?: MessengerAiAction[] };
      setActions(data.actions || []);
    } catch {
      // Background poll; keep UI calm on transient errors.
    }
  }, []);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), POPUP_REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const reviewAction = useCallback(
    async (input: {
      actionId: string;
      verdict: MessengerAiVerdict;
      finalPayload?: CopilotActionPayload;
      errorCategory?: MessengerAiErrorCategory | null;
      staffNote?: string | null;
    }) => {
      setBusyId(input.actionId);
      try {
        const res = await fetch('/api/messenger-ai/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          appliedSummary?: string | null;
          draftReply?: string | null;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || 'Failed to save review');
        await reload();
        return data;
      } finally {
        setBusyId(null);
      }
    },
    [reload]
  );

  return { actions, busyId, reviewAction, reload };
}

export function useMessengerAiDashboard() {
  const [data, setData] = useState<MessengerAiDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/messenger-ai?view=dashboard', { cache: 'no-store' });
      const json = (await res.json()) as MessengerAiDashboardData & { error?: string };
      if (!res.ok) throw new Error(json.error || 'Failed to load Copilot dashboard');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const scanNow = useCallback(
    async (opts?: { maxBursts?: number; quietSeconds?: number; lookbackHours?: number }) => {
      setScanning(true);
      setError(null);
      try {
        const res = await fetch('/api/messenger-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(opts || { maxBursts: 6, quietSeconds: 0, lookbackHours: 72 }),
        });
        const json = (await res.json()) as {
          scannedBursts: number;
          trivialSkipped: number;
          actionsCreated: number;
          noActionCount: number;
          creditError?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error || 'Scan failed');
        await reload();
        return json;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Scan failed';
        setError(msg);
        throw err;
      } finally {
        setScanning(false);
      }
    },
    [reload]
  );

  const reviewAction = useCallback(
    async (input: {
      actionId: string;
      verdict: MessengerAiVerdict;
      finalPayload?: CopilotActionPayload;
      errorCategory?: MessengerAiErrorCategory | null;
      staffNote?: string | null;
    }) => {
      setBusyId(input.actionId);
      try {
        const res = await fetch('/api/messenger-ai/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const json = (await res.json()) as {
          appliedSummary?: string | null;
          draftReply?: string | null;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error || 'Failed to review action');
        await reload();
        return json;
      } finally {
        setBusyId(null);
      }
    },
    [reload]
  );

  const patchRules = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch('/api/messenger-ai/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Update failed');
      await reload();
    },
    [reload]
  );

  return {
    data,
    loading,
    scanning,
    busyId,
    error,
    reload,
    scanNow,
    reviewAction,
    updateRule: (actionType: MessengerAiActionType, patch: Record<string, unknown>) =>
      patchRules({ kind: 'rule', actionType, ...patch }),
    toggleLesson: (lessonId: string, active: boolean) =>
      patchRules({ kind: 'lesson_toggle', lessonId, active }),
    deleteLesson: (lessonId: string) => patchRules({ kind: 'lesson_delete', lessonId }),
    addAlias: (phrase: string, productId: string, productName: string) =>
      patchRules({ kind: 'alias_add', phrase, productId, productName }),
    deleteAlias: (aliasId: string) => patchRules({ kind: 'alias_delete', aliasId }),
  };
}
