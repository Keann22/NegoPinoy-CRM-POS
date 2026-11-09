import { SupabaseClient } from '@supabase/supabase-js';
import type {
  InventoryCountProgressSummary,
  InventoryCountProgressItem,
  InventoryCountDailyStat,
  StaffCountAccuracy,
} from '@/types/inventory-guardian.types';

const PH_TZ = 'Asia/Manila';

/** Formats an ISO timestamp into Manila local date: YYYY-MM-DD */
export function phDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-CA', { timeZone: PH_TZ }).format(d);
}

function resolveItemName(product: any): { name: string; sku: string | null; variantName: string | null } {
  const p = Array.isArray(product) ? product[0] : product;
  if (!p) return { name: 'Unknown item', sku: null, variantName: null };
  const baseName = String(p.name || 'Unknown item');
  const variant = p.variant_name ? String(p.variant_name) : null;
  const displayName = variant && !baseName.includes(variant) ? `${baseName} [${variant}]` : baseName;
  return {
    name: displayName,
    sku: p.sku || null,
    variantName: variant,
  };
}

/**
 * Computes counting effort, exact shelf matches, and accuracy progress
 * from the long-term guardian memory table where physical shelf audits are recorded.
 */
export async function getInventoryCountProgress(
  supabase: SupabaseClient,
  historyDays = 14
): Promise<InventoryCountProgressSummary> {
  const todayStr = phDate(new Date());
  const cutoffDate = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('inventory_guardian_memory')
    .select('id, product_id, action_type, physical_count, system_stock_before, system_stock_after, discrepancy, actor_name, actor_id, notes, created_at, products(name, sku, variant_name)')
    .eq('action_type', 'physical_count_audit')
    .gte('created_at', cutoffDate)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch inventory count progress:', error);
    throw error;
  }

  const rows = data || [];

  // 1. Filter Today's counts
  const todayRows = rows.filter((r) => phDate(r.created_at) === todayStr);
  const totalCounted = todayRows.length;
  const matchedCount = todayRows.filter((r) => r.discrepancy === 0).length;
  const discrepancyCount = totalCounted - matchedCount;
  const accuracyRate = totalCounted > 0 ? Math.round((matchedCount / totalCounted) * 100) : 0;

  // 2. Staff breakdown for today
  const staffMap = new Map<string, { total: number; matched: number }>();
  for (const r of todayRows) {
    const actor = (r.actor_name || 'Staff').trim();
    if (!staffMap.has(actor)) {
      staffMap.set(actor, { total: 0, matched: 0 });
    }
    const stat = staffMap.get(actor)!;
    stat.total += 1;
    if (r.discrepancy === 0) {
      stat.matched += 1;
    }
  }

  const staffBreakdown: StaffCountAccuracy[] = Array.from(staffMap.entries())
    .map(([staffName, stat]) => ({
      staffName,
      totalCounted: stat.total,
      matchedCount: stat.matched,
      accuracyRate: stat.total > 0 ? Math.round((stat.matched / stat.total) * 100) : 0,
    }))
    .sort((a, b) => b.totalCounted - a.totalCounted);

  // 3. Format recent items (today's counts, or fallback to the latest 50 entries)
  const itemsToFormat = todayRows.length > 0 ? todayRows : rows.slice(0, 30);
  const recentItems: InventoryCountProgressItem[] = itemsToFormat.map((r) => {
    const { name, sku, variantName } = resolveItemName(r.products);
    return {
      id: r.id,
      productId: r.product_id,
      productName: name,
      sku,
      variantName,
      physicalCount: r.physical_count ?? 0,
      systemStockBefore: r.system_stock_before,
      systemStockAfter: r.system_stock_after,
      discrepancy: r.discrepancy ?? 0,
      actorName: r.actor_name || 'Staff',
      actorId: r.actor_id,
      createdAt: r.created_at,
      notes: r.notes,
      actionType: r.action_type,
    };
  });

  // 4. Daily historical accuracy stats
  const historyMap = new Map<string, { total: number; matched: number }>();
  for (const r of rows) {
    const d = phDate(r.created_at);
    if (!historyMap.has(d)) {
      historyMap.set(d, { total: 0, matched: 0 });
    }
    const h = historyMap.get(d)!;
    h.total += 1;
    if (r.discrepancy === 0) {
      h.matched += 1;
    }
  }

  const history: InventoryCountDailyStat[] = Array.from(historyMap.entries())
    .map(([date, stat]) => ({
      date,
      totalCounted: stat.total,
      matchedCount: stat.matched,
      diffCount: stat.total - stat.matched,
      accuracyRate: stat.total > 0 ? Math.round((stat.matched / stat.total) * 100) : 0,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    today: {
      date: todayStr,
      totalCounted,
      matchedCount,
      discrepancyCount,
      accuracyRate,
    },
    staffBreakdown,
    recentItems,
    history,
  };
}
