'use client';

import { useEffect, useState } from 'react';
import type { NewShipHold, ShipHoldAnswer, ShipHoldFormData, ShipHoldPrompt } from '@/types/ship-holds.types';

const API = '/api/shipping/holds';
/** Fired after a hold changes, so the Priority List and Packed Orders reload. */
export const SHIP_HOLDS_CHANGED_EVENT = 'ship-holds-changed';

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not save');
  window.dispatchEvent(new Event(SHIP_HOLDS_CHANGED_EVENT));
  return json as T;
}

export async function fetchShipHoldPrompts(): Promise<ShipHoldPrompt[]> {
  try {
    const res = await fetch(`${API}?prompts=1`, { cache: 'no-store' });
    if (!res.ok) return [];
    return (await res.json()).prompts || [];
  } catch {
    return [];
  }
}

export const saveShipHold = (input: NewShipHold) => post<{ ok: true }>({ action: 'hold', ...input });
export const releaseShipHold = (holdId: string) => post<{ ok: true; orderIds: string[] }>({ action: 'release', holdId });
export const answerShipHold = (holdId: string, answer: ShipHoldAnswer, checkOn?: string) =>
  post<{ ok: true }>({ action: 'answer', holdId, answer, checkOn });

/** Hold dialog: the order, its current hold and the customer's other open orders. */
export function useShipHoldForm(orderId: string | null) {
  const [loaded, setLoaded] = useState<{ orderId: string; form: ShipHoldFormData | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    fetch(`${API}?orderId=${encodeURIComponent(orderId)}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        setLoaded(res.ok ? { orderId, form: json.form, error: null } : { orderId, form: null, error: json.error || 'Could not load the order' });
      })
      .catch((e) => { if (alive) setLoaded({ orderId, form: null, error: String(e) }); });
    return () => { alive = false; };
  }, [orderId]);
  const current = orderId && loaded?.orderId === orderId ? loaded : null;
  return { form: current?.form || null, error: current?.error || null, loading: !!orderId && !current };
}
