'use client';

import { useCallback, useEffect, useState } from 'react';
import { shrinkPhoto } from '@/lib/image-shrink';
import type {
  BusCandidateOrder, BusSfAnswer, BusSfPrompt, BusTrip, SaveBusShipmentInput, SaveBusShipmentResult,
} from '@/types/bus-shipping.types';

/** Bus shipping API calls (fees, rates, the agent's SF pop-up). */

const API = '/api/shipping/bus';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not load');
  return json as T;
}

async function postJson<T>(body: unknown): Promise<T> {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not save');
  return json as T;
}

export const searchBusOrders = async (q: string) =>
  (await getJson<{ orders: BusCandidateOrder[] }>(`${API}?search=${encodeURIComponent(q)}`)).orders;

export const busOrdersForOrder = async (orderId: string) =>
  (await getJson<{ orders: BusCandidateOrder[] }>(`${API}?orderId=${encodeURIComponent(orderId)}`)).orders;

export const saveBusShipment = (input: SaveBusShipmentInput) => postJson<SaveBusShipmentResult>(input);

export const answerBusSfPrompt = (id: string, answer: BusSfAnswer) => postJson<{ ok: true }>({ action: 'answer', id, answer });

export async function fetchBusSfPrompts(): Promise<BusSfPrompt[]> {
  try {
    return (await getJson<{ prompts: BusSfPrompt[] }>(`${API}?prompts=1`)).prompts || [];
  } catch {
    return [];
  }
}

export async function uploadBusReceipt(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', await shrinkPhoto(file));
  const res = await fetch(`${API}/photo`, { method: 'POST', body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Photo upload failed');
  return json.url as string;
}

/** Every recorded trip (Bus Rates, and the "usually ₱…" hint when recording). */
export function useBusTrips() {
  const [trips, setTrips] = useState<BusTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // State is set only when the fetch comes back.
  const reload = useCallback(
    () => getJson<{ trips: BusTrip[] }>(`${API}?trips=1`)
      .then((json) => { setTrips(json.trips || []); setError(null); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => { void reload(); }, [reload]);
  return { trips, loading, error, reload };
}
