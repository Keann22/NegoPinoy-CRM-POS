import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from '@/lib/services/procurement-demand-service';
import type { ActivityCategory, StaffActivityBadge, StaffActivityItem } from '@/types';
import {
  isSystemActor,
  sanitizeReason,
  type ActivityDirectory,
  type ActivityTarget,
} from './staff-activity-people';

export interface ActivityWindow {
  startIso: string;
  endIso: string;
}

type MaybeArray<T> = T | T[] | null | undefined;

export function one<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function shortOrder(id: string | null | undefined): string {
  return id ? `#${String(id).slice(0, 7).toUpperCase()}` : '#ORDER';
}

export function formatProductName(
  product: MaybeArray<{ name?: string | null; variant_name?: string | null }>
): string {
  const p = one(product);
  if (!p?.name) return 'Unknown item';
  const name = String(p.name);
  const variant = p.variant_name ? String(p.variant_name) : '';
  return variant && !name.includes(variant) ? `${name} [${variant}]` : name;
}

interface SnapshotItem {
  product_name?: string;
  quantity?: number;
}

interface SnapshotData {
  items?: SnapshotItem[];
  reason?: string;
  productName?: string;
  quantity?: number;
}

interface OrderJoin {
  id: string;
  customers?: MaybeArray<{ full_name?: string | null }>;
}

interface OrderLogRow {
  id: string;
  order_id: string | null;
  status: string;
  user_name: string | null;
  created_at: string;
  snapshot_data: SnapshotData | null;
  orders?: MaybeArray<OrderJoin>;
}

interface OrderIssueRow {
  id: string;
  order_id: string | null;
  product_id: string | null;
  status: string;
  reported_by_name: string | null;
  created_at: string;
  out_of_stock_qty: number | null;
  issue_type: string | null;
  products?: MaybeArray<{ name?: string | null; variant_name?: string | null }>;
  orders?: MaybeArray<OrderJoin>;
}

function customerOf(orders: MaybeArray<OrderJoin>): string | null {
  const o = one(orders);
  const c = one(o?.customers);
  return c?.full_name ? String(c.full_name) : null;
}

function classifyOrderStatus(status: string): {
  category: ActivityCategory;
  actionLabel: string;
  badges?: StaffActivityBadge[];
} {
  switch (status) {
    case 'Picked':
      return { category: 'picking', actionLabel: 'Picked order' };
    case 'Picked (with issue)':
      return {
        category: 'picking',
        actionLabel: 'Picked order (with issue)',
        badges: [{ label: 'With issue', tone: 'warning' }],
      };
    case 'Borrowed Item':
      return {
        category: 'picking',
        actionLabel: 'Borrowed stock',
        badges: [{ label: 'Borrowed', tone: 'info' }],
      };
    case 'Issue Resolved':
      return { category: 'picking', actionLabel: 'Resolved picking issue' };
    case 'Pick It Now':
      return { category: 'picking', actionLabel: 'Requested immediate pick' };
    case 'Photo':
      return { category: 'checking', actionLabel: 'Second Check (Photo)' };
    case 'Packed':
      return { category: 'packing', actionLabel: 'Packed order' };
    case 'For Shipping':
      return { category: 'packing', actionLabel: 'Marked for shipping' };
    case 'Shipped':
      return { category: 'packing', actionLabel: 'Marked shipped' };
    default:
      return { category: 'tasks', actionLabel: status };
  }
}

function formatSnapshotDetail(snap: SnapshotData | null): string | null {
  if (!snap) return null;
  if (Array.isArray(snap.items) && snap.items.length > 0) {
    const preview = snap.items
      .slice(0, 3)
      .map((item) => {
        const qty = Number(item.quantity) || 1;
        return `${item.product_name || 'Item'} (×${qty})`;
      })
      .join(', ');
    const more = snap.items.length > 3 ? ` +${snap.items.length - 3} more` : '';
    return `${snap.items.length} item${snap.items.length === 1 ? '' : 's'}: ${preview}${more}`;
  }
  if (snap.productName) {
    const qtyPart = snap.quantity ? ` (×${snap.quantity})` : '';
    return `${snap.productName}${qtyPart}`;
  }
  if (snap.reason) return sanitizeReason(snap.reason);
  return null;
}

export async function fetchOrderActivity(
  supabase: SupabaseClient,
  window: ActivityWindow,
  directory: ActivityDirectory,
  target: ActivityTarget
): Promise<StaffActivityItem[]> {
  const [logs, issues] = await Promise.all([
    fetchAllPages<OrderLogRow>((from, to) =>
      supabase
        .from('order_logs')
        .select('id, order_id, status, user_name, created_at, snapshot_data, orders(id, customers(full_name))')
        .gte('created_at', window.startIso)
        .lte('created_at', window.endIso)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages<OrderIssueRow>((from, to) =>
      supabase
        .from('order_issues')
        .select('id, order_id, product_id, status, reported_by_name, created_at, out_of_stock_qty, issue_type, products(name, variant_name), orders(id, customers(full_name))')
        .gte('created_at', window.startIso)
        .lte('created_at', window.endIso)
        .neq('issue_type', 'staff_message')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);

  const unmatchedIssues: {
    row: OrderIssueRow;
    displayName: string;
    productName: string;
    ts: number;
  }[] = [];

  for (const issue of issues) {
    if (isSystemActor(issue.reported_by_name)) continue;
    const match = directory.matchesTarget(target, { name: issue.reported_by_name });
    if (!match.matched) continue;
    unmatchedIssues.push({
      row: issue,
      displayName: match.displayName,
      productName: formatProductName(issue.products),
      ts: Date.parse(issue.created_at),
    });
  }

  const usedIssueIds = new Set<string>();
  const items: StaffActivityItem[] = [];

  for (const log of logs) {
    if (isSystemActor(log.user_name)) continue;
    // Skip duplicate paired log and return log (covered by customer_return_events)
    if (log.status === 'Item Borrowed' || log.status === 'Returned') continue;

    const match = directory.matchesTarget(target, { name: log.user_name });
    if (!match.matched) continue;

    const customer = customerOf(log.orders);
    const orderNum = shortOrder(log.order_id);
    const title = customer ? `Order ${orderNum} · ${customer}` : `Order ${orderNum}`;
    const classified = classifyOrderStatus(log.status);
    const badges: StaffActivityBadge[] = classified.badges ? [...classified.badges] : [];
    let detail = formatSnapshotDetail(log.snapshot_data);

    if (log.status === 'Picked (with issue)' && log.order_id) {
      const logTs = Date.parse(log.created_at);
      const attached = unmatchedIssues.filter(
        (iss) =>
          !usedIssueIds.has(iss.row.id) &&
          iss.row.order_id === log.order_id &&
          iss.displayName === match.displayName &&
          Math.abs(iss.ts - logTs) <= 20_000
      );
      if (attached.length > 0) {
        attached.forEach((a) => usedIssueIds.add(a.row.id));
        const osText = attached
          .slice(0, 3)
          .map((a) => `${a.productName} (×${Number(a.row.out_of_stock_qty) || 1})`)
          .join(', ');
        const more = attached.length > 3 ? ` +${attached.length - 3} more` : '';
        detail = `Out of stock: ${osText}${more}`;
        badges.push({
          label: `${attached.length} OS item${attached.length === 1 ? '' : 's'}`,
          tone: 'danger',
        });
      }
    }

    items.push({
      id: `order_log:${log.id}`,
      category: classified.category,
      actionLabel: classified.actionLabel,
      title,
      detail,
      actorName: match.displayName,
      timestamp: log.created_at,
      href: log.order_id ? `/dashboard/orders/${log.order_id}` : null,
      badges: badges.length > 0 ? badges : undefined,
    });
  }

  for (const iss of unmatchedIssues) {
    if (usedIssueIds.has(iss.row.id)) continue;
    const customer = customerOf(iss.row.orders);
    const orderNum = shortOrder(iss.row.order_id);
    const qty = Number(iss.row.out_of_stock_qty) || 1;
    items.push({
      id: `order_issue:${iss.row.id}`,
      category: 'picking',
      actionLabel: 'Reported out of stock',
      title: customer ? `Order ${orderNum} · ${customer}` : `Order ${orderNum}`,
      detail: `${iss.productName} (×${qty})`,
      actorName: iss.displayName,
      timestamp: iss.row.created_at,
      href: iss.row.order_id ? `/dashboard/orders/${iss.row.order_id}` : null,
      badges: [{ label: `OS ×${qty}`, tone: 'danger' }],
    });
  }

  return items;
}
