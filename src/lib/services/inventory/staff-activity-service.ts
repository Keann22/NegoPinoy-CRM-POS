import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ActivityCategory,
  ActivityDatePreset,
  StaffActivityItem,
  StaffActivityResponse,
  StaffActivitySummary,
} from '@/types';
import {
  buildActivityDirectory,
  normName,
  type ActivityPerson,
  type ActivityTarget,
} from './staff-activity-people';
import { fetchOrderActivity } from './staff-activity-order-sources';
import { fetchWarehouseActivity } from './staff-activity-warehouse-sources';
import { fetchOpsActivity } from './staff-activity-ops-sources';

const PH_TZ = 'Asia/Manila';
const MAX_RANGE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface StaffActivityCaller {
  userId: string;
  email: string;
  fullName: string;
  isManagement: boolean;
}

export interface StaffActivityQuery {
  preset?: ActivityDatePreset;
  from?: string | null;
  to?: string | null;
  personKey?: string | null;
  category?: ActivityCategory | 'all' | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

function phTodayString(now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PH_TZ }).format(new Date(now));
}

function shiftPhDate(yyyyMmDd: string, deltaDays: number): string {
  const base = new Date(`${yyyyMmDd}T12:00:00+08:00`).getTime();
  return phTodayString(base + deltaDays * DAY_MS);
}

function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function resolvePhDateRange(
  preset: ActivityDatePreset,
  customFrom?: string | null,
  customTo?: string | null
): { from: string; to: string; preset: ActivityDatePreset; startIso: string; endIso: string } {
  const today = phTodayString();
  let from = today;
  let to = today;

  if (preset === 'yesterday') {
    from = shiftPhDate(today, -1);
    to = from;
  } else if (preset === '7d') {
    from = shiftPhDate(today, -6);
  } else if (preset === '30d') {
    from = shiftPhDate(today, -29);
  } else if (preset === 'custom' && isIsoDate(customFrom)) {
    from = customFrom;
    to = isIsoDate(customTo) ? customTo : customFrom;
    if (from > to) [from, to] = [to, from];
    // Clamp custom range to max 60 days
    const minAllowed = shiftPhDate(to, -(MAX_RANGE_DAYS - 1));
    if (from < minAllowed) from = minAllowed;
  }

  return {
    from,
    to,
    preset,
    startIso: `${from}T00:00:00+08:00`,
    endIso: `${to}T23:59:59.999+08:00`,
  };
}

function emptyByCategory(): Record<ActivityCategory, number> {
  return {
    picking: 0,
    checking: 0,
    packing: 0,
    receiving: 0,
    counting: 0,
    transfers: 0,
    returns: 0,
    tasks: 0,
    shipping: 0,
  };
}

function matchesSearch(item: StaffActivityItem, needle: string): boolean {
  if (!needle) return true;
  const hay = [
    item.title,
    item.detail,
    item.actionLabel,
    item.actorName,
    ...(item.badges || []).map((b) => b.label),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(needle);
}

export async function getStaffActivity(
  supabase: SupabaseClient,
  caller: StaffActivityCaller,
  query: StaffActivityQuery
): Promise<StaffActivityResponse> {
  const directory = await buildActivityDirectory(supabase);
  const callerPerson: ActivityPerson = directory.findByUserId(caller.userId) || {
    key: caller.userId,
    name: caller.fullName || caller.email || 'Staff',
    roles: caller.isManagement ? ['Admin'] : ['Inventory'],
    isInventoryTeam: !caller.isManagement,
    isManagement: caller.isManagement,
    lastSignIn: '',
    ids: new Set([caller.userId]),
    aliases: new Set([normName(caller.fullName), normName(caller.email)].filter(Boolean)),
  };

  let target: ActivityTarget;
  let resolvedPersonKey: string;
  let resolvedPersonName: string;

  if (!caller.isManagement) {
    target = { mode: 'person', person: callerPerson };
    resolvedPersonKey = callerPerson.key;
    resolvedPersonName = callerPerson.name;
  } else if (query.personKey === 'me') {
    target = { mode: 'person', person: callerPerson };
    resolvedPersonKey = callerPerson.key;
    resolvedPersonName = callerPerson.name;
  } else if (query.personKey && query.personKey !== 'all') {
    const picked = directory.findByKey(query.personKey);
    if (picked) {
      target = { mode: 'person', person: picked };
      resolvedPersonKey = picked.key;
      resolvedPersonName = picked.name;
    } else {
      target = { mode: 'all_inventory' };
      resolvedPersonKey = 'all';
      resolvedPersonName = 'All Inventory Staff';
    }
  } else {
    target = { mode: 'all_inventory' };
    resolvedPersonKey = 'all';
    resolvedPersonName = 'All Inventory Staff';
  }

  const preset: ActivityDatePreset = query.preset || 'today';
  const range = resolvePhDateRange(preset, query.from, query.to);
  const window = { startIso: range.startIso, endIso: range.endIso };

  const [orderItems, warehouseResult, opsItems] = await Promise.all([
    fetchOrderActivity(supabase, window, directory, target),
    fetchWarehouseActivity(supabase, window, directory, target),
    fetchOpsActivity(supabase, window, directory, target),
  ]);

  const allItems = [...orderItems, ...warehouseResult.items, ...opsItems].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
  );

  const byCategory = emptyByCategory();
  for (const item of allItems) {
    byCategory[item.category] += 1;
  }

  const summary: StaffActivitySummary = {
    totalActions: allItems.length,
    byCategory,
    receivedPieces: warehouseResult.receivedPieces,
    countsMatched: warehouseResult.countsMatched,
    countsTotal: warehouseResult.countsTotal,
  };

  const categoryFilter = query.category && query.category !== 'all' ? query.category : null;
  const searchNeedle = (query.search || '').trim().toLowerCase();

  const filtered = allItems.filter((item) => {
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (searchNeedle && !matchesSearch(item, searchNeedle)) return false;
    return true;
  });

  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const offset = Math.max(0, Number(query.offset) || 0);
  const paged = filtered.slice(offset, offset + limit);

  return {
    items: paged,
    summary,
    totalFiltered: filtered.length,
    hasMore: offset + paged.length < filtered.length,
    resolvedPersonKey,
    resolvedPersonName,
    isManagement: caller.isManagement,
    staffOptions: caller.isManagement ? directory.options : [],
    dateRange: {
      from: range.from,
      to: range.to,
      preset: range.preset,
    },
  };
}
