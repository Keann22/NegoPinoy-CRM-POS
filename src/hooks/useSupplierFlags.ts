'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { checkOrderAgainstFlags } from '@/lib/supplier-stock/order-flag-check';
import type {
  OldProcurementIssue, SetSupplierFlagInput, SupplierFlag, SupplierFlagWithOrders, SupplierPrompt, SupplierPromptAnswer,
} from '@/types/supplier-stock.types';

/** Out of stock at the supplier: client calls for /api/inventory/supplier-stock. */

const API = '/api/inventory/supplier-stock';

async function send(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export async function fetchSupplierFlags(productIds?: string[]): Promise<SupplierFlag[]> {
  if (productIds && productIds.length === 0) return [];
  const qs = productIds ? `?productIds=${encodeURIComponent(productIds.join(','))}` : '';
  const res = await fetch(`${API}${qs}`, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  return res.ok ? json.flags || [] : [];
}

export const setSupplierFlag = (input: SetSupplierFlagInput) => send('POST', API, input);
export const clearSupplierFlag = (productId: string) => send('PATCH', API, { action: 'clear', productId });
export const closeOldIssue = (issueId: string) => send('PATCH', API, { action: 'close_old', issueId });

export async function fetchSupplierPrompts(): Promise<SupplierPrompt[]> {
  const res = await fetch(`${API}/prompts`, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  return res.ok ? json.prompts || [] : [];
}

export const answerSupplierPrompt = (flagId: string, orderId: string, answer: SupplierPromptAnswer, note?: string) =>
  send('POST', `${API}/prompts`, { flagId, orderId, answer, note });

/** New / Edit Order: the agent ticked "customer knows and agrees" for these items. */
export const recordAgreedOnOrder = (orderId: string, productIds: string[]) =>
  productIds.length === 0 ? Promise.resolve() : send('POST', `${API}/prompts`, { action: 'agreed', orderId, productIds });

/** Before saving New / Edit Order: fresh statuses for its items, checked against the agent's ticks. */
export async function checkSupplierFlagsBeforeSave(
  items: Parameters<typeof checkOrderAgainstFlags>[0], originals: Parameters<typeof checkOrderAgainstFlags>[1],
) {
  const list = await fetchSupplierFlags(Array.from(new Set(items.map((i) => i.productId))));
  return checkOrderAgainstFlags(items, originals, Object.fromEntries(list.map((f) => [f.productId, f])));
}

/** Active statuses keyed by product id (badges on the Procurement Sheet and New Order). */
export function useSupplierFlagMap(enabled = true) {
  const [flags, setFlags] = useState<Record<string, SupplierFlag>>({});
  const reload = useCallback(async () => {
    const list = await fetchSupplierFlags();
    setFlags(Object.fromEntries(list.map((f) => [f.productId, f])));
  }, []);
  useEffect(() => { if (enabled) reload(); }, [enabled, reload]);
  return { flags, reload };
}

/** Other variants under the same main product ("only another color/size"), with their selling price. */
export function useSiblingVariants(productId: string | null | undefined) {
  const [variants, setVariants] = useState<{ id: string; name: string; price: number | null }[]>([]);
  const [current, setCurrent] = useState<{ price: number | null } | null>(null);
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: me } = await supabase.from('products').select('parent_id, selling_price').eq('id', productId).single();
      if (cancelled) return;
      setCurrent({ price: me?.selling_price == null ? null : Number(me.selling_price) });
      if (!me?.parent_id) { setVariants([]); return; }
      const { data } = await supabase.from('products')
        .select('id, name, variant_name, selling_price')
        .eq('parent_id', me.parent_id).neq('id', productId)
        .not('name', 'ilike', '[DELETED]%').order('variant_name');
      if (cancelled) return;
      setVariants((data || []).map((p: { id: string; name: string; variant_name: string | null; selling_price: number | null }) => ({
        id: p.id, name: p.variant_name || p.name, price: p.selling_price == null ? null : Number(p.selling_price),
      })));
    })();
    return () => { cancelled = true; };
  }, [productId]);
  return { variants, currentPrice: current?.price ?? null };
}

/** Wala sa Supplier page data. */
export function useSupplierFlagPage() {
  const [flags, setFlags] = useState<SupplierFlagWithOrders[]>([]);
  const [oldIssues, setOldIssues] = useState<OldProcurementIssue[]>([]);
  const [canSetStatus, setCanSetStatus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const json = await send('GET', `${API}?page=1`);
      setFlags(json.flags || []);
      setOldIssues(json.oldIssues || []);
      setCanSetStatus(!!json.canSetStatus);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { flags, oldIssues, canSetStatus, loading, error, reload };
}
