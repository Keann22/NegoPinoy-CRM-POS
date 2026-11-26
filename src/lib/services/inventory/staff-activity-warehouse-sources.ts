import type { SupabaseClient } from '@supabase/supabase-js';
import { scoreShelfCount } from '@/lib/services/inventory/count-match';
import { fetchAllPages } from '@/lib/services/procurement-demand-service';
import { warehouseLabel } from '@/lib/warehouse-labels';
import type { StaffActivityBadge, StaffActivityItem } from '@/types';
import {
  isSystemActor,
  sanitizeReason,
  type ActivityDirectory,
  type ActivityTarget,
} from './staff-activity-people';
import { formatProductName, type ActivityWindow } from './staff-activity-order-sources';

export interface WarehouseActivityResult {
  items: StaffActivityItem[];
  receivedPieces: number;
  countsMatched: number;
  countsTotal: number;
}

interface WarehouseRow {
  id: string;
  code: string;
  name: string;
}

type ProductJoin =
  | { name?: string | null; variant_name?: string | null }
  | { name?: string | null; variant_name?: string | null }[]
  | null;

interface MovementRow {
  id: string;
  product_id: string;
  quantity_change: number;
  movement_type: string;
  timestamp: string;
  reason: string | null;
  warehouse_id: string | null;
  performed_by_id: string | null;
  performed_by_name: string | null;
  products?: ProductJoin;
}

interface GuardianMemoryRow {
  id: string;
  product_id: string;
  action_type: string;
  physical_count: number | null;
  system_stock_before: number | null;
  system_stock_after: number | null;
  discrepancy: number | null;
  actor_name: string | null;
  actor_id: string | null;
  notes: string | null;
  created_at: string;
  products?: ProductJoin;
}

interface TransferRow {
  id: string;
  transfer_number: string;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  stock_transfer_items?: { quantity: number; products?: ProductJoin }[] | null;
}

function classifyCountSource(notes: string | null | undefined): string {
  const n = String(notes || '').toLowerCase();
  if (n.includes('recount') || n.includes('pabilang')) return 'Shelf count (Recount)';
  if (n.includes('picker')) return 'Shelf count (Picker)';
  if (n.includes('procurement')) return 'Shelf count (Procurement)';
  return 'Shelf count (Guardian)';
}

function friendlyMovementReason(reason: string | null): string | null {
  const cleaned = sanitizeReason(reason);
  if (!cleaned) return null;
  if (cleaned === 'Received from PO') return 'From recorded purchase';
  return cleaned;
}

export async function fetchWarehouseActivity(
  supabase: SupabaseClient,
  window: ActivityWindow,
  directory: ActivityDirectory,
  target: ActivityTarget
): Promise<WarehouseActivityResult> {
  const [warehousesRes, movements, counts, transfersRes] = await Promise.all([
    supabase.from('warehouses').select('id, code, name'),
    fetchAllPages<MovementRow>((from, to) =>
      supabase
        .from('inventory_movements')
        // Confidentiality: NEVER select supplier_name or unit_cost
        .select('id, product_id, quantity_change, movement_type, timestamp, reason, warehouse_id, performed_by_id, performed_by_name, products(name, variant_name)')
        .gte('timestamp', window.startIso)
        .lte('timestamp', window.endIso)
        .not('movement_type', 'in', '("sale","return","supplier_return")')
        .order('timestamp', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages<GuardianMemoryRow>((from, to) =>
      supabase
        .from('inventory_guardian_memory')
        .select('id, product_id, action_type, physical_count, system_stock_before, system_stock_after, discrepancy, actor_name, actor_id, notes, created_at, products(name, variant_name)')
        .gte('created_at', window.startIso)
        .lte('created_at', window.endIso)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    supabase
      .from('stock_transfers')
      .select('id, transfer_number, from_warehouse_id, to_warehouse_id, notes, created_by, created_at, stock_transfer_items(quantity, products(name, variant_name))')
      .gte('created_at', window.startIso)
      .lte('created_at', window.endIso)
      .order('created_at', { ascending: false }),
  ]);

  if (warehousesRes.error) throw warehousesRes.error;
  if (transfersRes.error) throw transfersRes.error;

  const warehouseMap = new Map<string, string>(
    ((warehousesRes.data || []) as WarehouseRow[]).map((w) => [w.id, warehouseLabel(w.code, w.name)])
  );

  const items: StaffActivityItem[] = [];
  let receivedPieces = 0;
  let countsMatched = 0;
  let countsTotal = 0;

  for (const m of movements) {
    if (!m.performed_by_id && isSystemActor(m.performed_by_name)) continue;
    const reason = String(m.reason || '');
    if (
      reason.startsWith('Picker checked Unit 2') ||
      reason.startsWith('Keeps the last shelf count true')
    ) {
      continue;
    }

    const match = directory.matchesTarget(target, {
      id: m.performed_by_id,
      name: m.performed_by_name,
    });
    if (!match.matched) continue;

    const qty = Number(m.quantity_change) || 0;
    const typeUpper = String(m.movement_type || '').toUpperCase();
    const isRestock = typeUpper === 'RESTOCK';
    const isCorrection = m.movement_type === 'receipt_correction';

    if (isRestock && qty > 0) receivedPieces += qty;

    const badges: StaffActivityBadge[] = [
      {
        label: `${qty >= 0 ? '+' : ''}${qty} pcs`,
        tone: isRestock ? 'success' : isCorrection ? 'warning' : 'info',
      },
    ];
    const wh = m.warehouse_id ? warehouseMap.get(m.warehouse_id) : null;
    if (wh) badges.push({ label: wh, tone: 'neutral' });

    items.push({
      id: `movement:${m.id}`,
      category: 'receiving',
      actionLabel: isRestock
        ? 'Received stock'
        : isCorrection
          ? 'Receipt correction'
          : 'Stock adjustment',
      title: formatProductName(m.products),
      detail: friendlyMovementReason(m.reason),
      actorName: match.displayName,
      timestamp: m.timestamp,
      href: isRestock ? '/dashboard/inventory/receive' : '/dashboard/inventory/movements',
      badges,
    });
  }

  for (const c of counts) {
    if (!c.actor_id && isSystemActor(c.actor_name)) continue;
    const match = directory.matchesTarget(target, { id: c.actor_id, name: c.actor_name });
    if (!match.matched) continue;

    const productName = formatProductName(c.products);
    const badges: StaffActivityBadge[] = [];
    let actionLabel = 'Shelf check';

    if (c.action_type === 'physical_count_audit') {
      actionLabel = classifyCountSource(c.notes);
      const { shelfDiff, isMatch } = scoreShelfCount(c);
      countsTotal += 1;
      if (isMatch) countsMatched += 1;
      badges.push({ label: `Counted ${c.physical_count ?? 0}`, tone: 'neutral' });
      if (isMatch) {
        badges.push({ label: 'Matches shelf', tone: 'success' });
      } else if (shelfDiff > 0) {
        badges.push({ label: `Over by +${shelfDiff}`, tone: 'warning' });
      } else {
        badges.push({ label: `Short by ${shelfDiff}`, tone: 'danger' });
      }
    } else if (c.action_type === 'picker_count_held') {
      actionLabel = 'Picker count (held)';
      badges.push({ label: `Counted ${c.physical_count ?? 0}`, tone: 'neutral' });
      badges.push({ label: 'Held for owner review', tone: 'warning' });
    } else if (c.action_type === 'borrow_tagged') {
      actionLabel = 'Tagged borrowed stock';
    } else if (c.action_type === 'anomaly_dismissed') {
      actionLabel = 'Dismissed stock alert';
    }

    items.push({
      id: `guardian:${c.id}`,
      category: 'counting',
      actionLabel,
      title: productName,
      detail: sanitizeReason(c.notes),
      actorName: match.displayName,
      timestamp: c.created_at,
      href: '/dashboard/inventory/recount',
      badges: badges.length > 0 ? badges : undefined,
    });
  }

  for (const t of (transfersRes.data || []) as TransferRow[]) {
    if ((t.notes || '').startsWith('Picked from 4A')) continue;
    if (isSystemActor(t.created_by)) continue;
    const match = directory.matchesTarget(target, { name: t.created_by });
    if (!match.matched) continue;

    const fromLabel = (t.from_warehouse_id && warehouseMap.get(t.from_warehouse_id)) || 'From';
    const toLabel = (t.to_warehouse_id && warehouseMap.get(t.to_warehouse_id)) || 'To';
    const transferItems = t.stock_transfer_items || [];
    const itemSummary =
      transferItems.length > 0
        ? transferItems
            .slice(0, 3)
            .map((i) => `${formatProductName(i.products)} (×${i.quantity})`)
            .join(', ') + (transferItems.length > 3 ? ` +${transferItems.length - 3} more` : '')
        : sanitizeReason(t.notes);

    items.push({
      id: `transfer:${t.id}`,
      category: 'transfers',
      actionLabel: `Transferred ${fromLabel} → ${toLabel}`,
      title: `${fromLabel} → ${toLabel} · ${t.transfer_number}`,
      detail: itemSummary,
      actorName: match.displayName,
      timestamp: t.created_at,
      href: '/dashboard/inventory/transfers',
      badges:
        transferItems.length > 0
          ? [{ label: `${transferItems.length} item${transferItems.length === 1 ? '' : 's'}`, tone: 'info' }]
          : undefined,
    });
  }

  return { items, receivedPieces, countsMatched, countsTotal };
}
