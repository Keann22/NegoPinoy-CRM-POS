'use client';

import { SHIP_HOLDS_CHANGED_EVENT } from '@/hooks/useShipHolds';
import type { PickDeferral, PickQuestion, PickSkipAnswer, PickSkipReason } from '@/types/pick-skips.types';

const API = '/api/shipping/pick-skips';

async function post(body: Record<string, unknown>): Promise<void> {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not save');
  // Same event as holds: the pop-up, Ready to Pick and the Priority List reload.
  window.dispatchEvent(new Event(SHIP_HOLDS_CHANGED_EVENT));
}

/** Warehouse: "Don't pick yet", and why. */
export const skipPick = (orderId: string, reason: PickSkipReason, note: string) => post({ action: 'skip', orderId, reason, note });
/** Sales: pick it now, or asked the customer (back in 4 hours). */
export const answerPickSkip = (id: string, answer: PickSkipAnswer) => post({ action: 'answer', id, answer });

export async function fetchPickQuestions(): Promise<PickQuestion[]> {
  try {
    const res = await fetch(`${API}?prompts=1`, { cache: 'no-store' });
    if (!res.ok) return [];
    return (await res.json()).questions || [];
  } catch {
    return [];
  }
}

/** Picker scan: does this order ship later (too early to pick)? Null when it can be picked or the check fails. */
export async function fetchPickDeferral(orderId: string): Promise<PickDeferral | null> {
  try {
    const res = await fetch(`${API}?pickCheck=${encodeURIComponent(orderId)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()).deferral || null;
  } catch {
    return null;
  }
}
