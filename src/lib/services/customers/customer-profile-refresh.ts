import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSharedCatalogSnapshot } from './customer-profile-context';
import { generateCustomerProfile } from './customer-profile-service';

export interface RefreshProfilesResult {
  dirtyCount: number;
  unprofiledCount: number;
  refreshed: number;
  newlyBuilt: number;
  failed: number;
}

/**
 * Continuously keeps customer personas up to date:
 * 1. Re-analyzes profiles flagged `needs_refresh = true` by DB triggers (orders, payments, chats).
 * 2. Builds personas for any newly ordered customers without a profile yet.
 * 3. Re-checks overdue lay-away follow-up profiles older than 7 days.
 */
export async function refreshStaleCustomerProfiles(
  supabase: SupabaseClient,
  opts: { limit?: number; concurrency?: number; dryRun?: boolean } = {}
): Promise<RefreshProfilesResult> {
  const limit = Math.min(50, Math.max(1, Math.round(opts.limit ?? 15)));
  const concurrency = Math.min(6, Math.max(1, Math.round(opts.concurrency ?? 3)));

  const [dirtyCountRes, dirtyRowsRes, unprofiledRes] = await Promise.all([
    supabase
      .from('customer_profiles')
      .select('customer_id', { count: 'exact', head: true })
      .eq('needs_refresh', true),
    supabase
      .from('customer_profiles')
      .select('customer_id')
      .eq('needs_refresh', true)
      .order('needs_refresh_at', { ascending: true, nullsFirst: true })
      .limit(limit),
    supabase.rpc('get_unprofiled_order_customers', { p_limit: Math.max(limit, 100) }),
  ]);

  if (dirtyCountRes.error) throw dirtyCountRes.error;
  if (dirtyRowsRes.error) throw dirtyRowsRes.error;
  if (unprofiledRes.error) throw unprofiledRes.error;

  const dirtyCount = dirtyCountRes.count ?? 0;
  const unprofiledRows = (unprofiledRes.data ?? []) as Array<{ customer_id: string }>;
  const unprofiledCount = unprofiledRows.length;

  if (opts.dryRun) {
    return { dirtyCount, unprofiledCount, refreshed: 0, newlyBuilt: 0, failed: 0 };
  }

  const queue: Array<{ customerId: string; isNew: boolean }> = [];
  const seen = new Set<string>();

  for (const r of dirtyRowsRes.data ?? []) {
    const id = String(r.customer_id);
    if (!seen.has(id) && queue.length < limit) {
      seen.add(id);
      queue.push({ customerId: id, isNew: false });
    }
  }

  for (const r of unprofiledRows) {
    const id = String(r.customer_id);
    if (!seen.has(id) && queue.length < limit) {
      seen.add(id);
      queue.push({ customerId: id, isNew: true });
    }
  }

  if (queue.length < limit) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: overdueRows } = await supabase
      .from('customer_profiles')
      .select('customer_id')
      .eq('next_action_type', 'payment_followup')
      .lt('generated_at', sevenDaysAgo)
      .order('generated_at', { ascending: true })
      .limit(limit - queue.length);
    for (const r of overdueRows ?? []) {
      const id = String(r.customer_id);
      if (!seen.has(id) && queue.length < limit) {
        seen.add(id);
        queue.push({ customerId: id, isNew: false });
      }
    }
  }

  if (queue.length === 0) {
    return { dirtyCount, unprofiledCount, refreshed: 0, newlyBuilt: 0, failed: 0 };
  }

  const sharedCatalog = await loadSharedCatalogSnapshot(supabase);
  let cursor = 0;
  let refreshed = 0;
  let newlyBuilt = 0;
  let failed = 0;

  const worker = async () => {
    while (cursor < queue.length) {
      const idx = cursor++;
      const item = queue[idx];
      try {
        await generateCustomerProfile(supabase, { customerId: item.customerId }, sharedCatalog);
        if (item.isNew) newlyBuilt++;
        else refreshed++;
      } catch (err) {
        failed++;
        console.warn(`Auto-refresh persona skipped ${item.customerId}:`, err);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  );

  return { dirtyCount, unprofiledCount, refreshed, newlyBuilt, failed };
}
