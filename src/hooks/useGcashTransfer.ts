'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SaveTransferInput,
  SaveTransferResult,
  TransferOrder,
} from '@/types/gcash-transfer.types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Uploads a proof-of-payment image and returns its URL. */
export async function uploadProof(supabase: SupabaseClient, file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from('proof_of_payment').upload(fileName, file, { upsert: false });
  if (error) throw error;
  return supabase.storage.from('proof_of_payment').getPublicUrl(data.path).data.publicUrl;
}

export interface TransferPick {
  on: boolean;
  amount: string;
}

/**
 * "One GCash, several orders" state for Log Payment: the customer's orders that still
 * owe, which ones this GCash pays, and how much each gets (pre-filled; editable).
 */
export function useGcashTransfer(mainOrderId: string, enabled: boolean) {
  const [orders, setOrders] = useState<TransferOrder[]>([]);
  const [picks, setPicks] = useState<Record<string, TransferPick>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    fetch(`/api/payments/transfer?orderId=${encodeURIComponent(mainOrderId)}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load the orders');
        if (cancelled) return;
        const list = data.orders as TransferOrder[];
        setOrders(list);
        // Only the opened order is picked at first; the agent ticks the others.
        setPicks(Object.fromEntries(list.map((o) => [
          o.id,
          { on: o.id === mainOrderId, amount: o.suggestedShare > 0 ? String(o.suggestedShare) : '' },
        ])));
      })
      .catch((err: unknown) => !cancelled && setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mainOrderId, enabled]);

  const setPick = useCallback((orderId: string, patch: Partial<TransferPick>) => {
    setPicks((prev) => ({ ...prev, [orderId]: { ...prev[orderId], ...patch } }));
  }, []);

  const shares = useMemo(
    () => orders
      .filter((o) => picks[o.id]?.on)
      .map((o) => ({ orderId: o.id, amount: round2(Number(picks[o.id]?.amount || 0)) })),
    [orders, picks],
  );
  const sharesTotal = round2(shares.reduce((sum, s) => sum + s.amount, 0));

  const save = useCallback(async (input: Omit<SaveTransferInput, 'shares' | 'mainOrderId'>): Promise<SaveTransferResult> => {
    const res = await fetch('/api/payments/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, mainOrderId, shares }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save the payment');
    return data as SaveTransferResult;
  }, [mainOrderId, shares]);

  return { orders, picks, setPick, shares, sharesTotal, isLoading, loadError, save };
}

export type GcashTransferState = ReturnType<typeof useGcashTransfer>;
