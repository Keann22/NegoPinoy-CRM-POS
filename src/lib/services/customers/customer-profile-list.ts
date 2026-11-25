import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CustomerPersonaMetrics,
  CustomerProfileListItem,
  NextActionType,
  PersonaType,
  StaffProfileVerdict,
} from '@/types';
import { isWorthMessagingToday } from '@/types';
import { loadSharedCatalogSnapshot } from './customer-profile-context';
import { generateCustomerProfile } from './customer-profile-service';

/**
 * Chat ids (psid) whose customer wrote within the last 24 hours (Facebook's
 * promo window). Worked out live: the value saved on the profile goes stale.
 */
export async function psidsMessagedWithin24h(supabase: SupabaseClient): Promise<Set<string>> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const psids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('conversation_logs')
      .select('customer_psid')
      .eq('sender_type', 'customer')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) if (r.customer_psid) psids.add(String(r.customer_psid));
    if (!data || data.length < 1000) break;
  }
  return psids;
}

interface ProfileIndexRow {
  customer_id: string;
  psid: string | null;
  persona_type: PersonaType;
  persona_label: string;
  summary: string;
  next_action_type: NextActionType;
  metrics: CustomerPersonaMetrics | null;
  staff_verdict: StaffProfileVerdict | null;
  generated_at: string;
}

async function fetchAllProfileIndexRows(supabase: SupabaseClient): Promise<ProfileIndexRow[]> {
  const rows: ProfileIndexRow[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from('customer_profiles')
      .select('customer_id, psid, persona_type, persona_label, summary, next_action_type, metrics, staff_verdict, generated_at')
      .order('generated_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    const chunk = (data ?? []) as unknown as ProfileIndexRow[];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return rows;
}

export async function listCustomerProfiles(
  supabase: SupabaseClient,
  opts: { persona?: string | null; action?: string | null; todayOnly?: boolean } = {}
): Promise<{
  profiles: CustomerProfileListItem[];
  countsByPersona: Record<string, number>;
  totalProfiled: number;
  worthMessagingCount: number;
}> {
  const [rows, recentPsids] = await Promise.all([
    fetchAllProfileIndexRows(supabase),
    psidsMessagedWithin24h(supabase),
  ]);

  const countsByPersona: Record<string, number> = {};
  let worthMessagingCount = 0;

  const all: CustomerProfileListItem[] = rows.map((r) => {
    countsByPersona[r.persona_type] = (countsByPersona[r.persona_type] || 0) + 1;
    const within24hWindow = Boolean(r.psid && recentPsids.has(r.psid));
    const overdueLayawayCount = Number(r.metrics?.overdueLayawayCount || 0);
    if (isWorthMessagingToday({ nextActionType: r.next_action_type, overdueLayawayCount, within24hWindow })) {
      worthMessagingCount++;
    }
    return {
      customerId: r.customer_id,
      personaType: r.persona_type,
      personaLabel: r.persona_label,
      summary: r.summary,
      nextActionType: r.next_action_type,
      within24hWindow,
      overdueLayawayCount,
      staffVerdict: r.staff_verdict,
      generatedAt: r.generated_at,
    };
  });

  const filtered = all.filter((item) => {
    if (opts.persona && item.personaType !== opts.persona) return false;
    if (opts.action && item.nextActionType !== opts.action) return false;
    if (opts.todayOnly) return isWorthMessagingToday(item);
    return true;
  });

  return { profiles: filtered, countsByPersona, totalProfiled: all.length, worthMessagingCount };
}

export async function generateBatchProfiles(
  supabase: SupabaseClient,
  limit = 5
): Promise<{ generated: number; failed: number; totalAttempted: number; items: CustomerProfileListItem[] }> {
  const clamped = Math.min(8, Math.max(1, Math.round(limit)));
  const [{ data: candidates, error: rpcErr }, sharedCatalog] = await Promise.all([
    supabase.rpc('get_unprofiled_order_customers', { p_limit: clamped }),
    loadSharedCatalogSnapshot(supabase),
  ]);
  if (rpcErr) throw rpcErr;

  const chosen = (candidates ?? []) as Array<{ customer_id: string }>;
  let generated = 0;
  let failed = 0;
  const items: CustomerProfileListItem[] = [];

  for (const c of chosen) {
    try {
      const res = await generateCustomerProfile(
        supabase,
        { customerId: String(c.customer_id) },
        sharedCatalog
      );
      if (res.profile) {
        generated++;
        items.push({
          customerId: res.profile.customerId,
          personaType: res.profile.personaType,
          personaLabel: res.profile.personaLabel,
          summary: res.profile.summary,
          nextActionType: res.profile.nextActionType,
          within24hWindow: res.profile.metrics.within24hWindow,
          overdueLayawayCount: res.profile.metrics.overdueLayawayCount,
          staffVerdict: res.profile.staffVerdict,
          generatedAt: res.profile.generatedAt,
        });
      }
    } catch (err) {
      failed++;
      console.warn(`Batch persona skipped customer ${c.customer_id}:`, err);
    }
  }

  return { generated, failed, totalAttempted: chosen.length, items };
}
