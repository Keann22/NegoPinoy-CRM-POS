import type { SupabaseClient } from '@supabase/supabase-js';

export interface FetchOrdersInRangeOptions {
  selectCols?: string;
  fromISO: string;
  toISO: string;
  dateColumn?: 'order_date' | 'created_at';
  statusesToExclude?: string[];
}

/**
 * Paginates through orders within a date range to prevent the Supabase/PostgREST
 * 1000-row silent cap from truncating historical reporting data.
 */
export async function fetchOrdersInRange(
  supabase: SupabaseClient,
  options: FetchOrdersInRangeOptions
): Promise<any[]> {
  const {
    selectCols = 'id, total_amount, status, order_date, created_at, sales_person_id',
    fromISO,
    toISO,
    dateColumn = 'order_date',
    statusesToExclude = ['Cancelled', 'Returned'],
  } = options;

  const orders = await fetchAllPages(() =>
    supabase
      .from('orders')
      .select(selectCols)
      .gte(dateColumn, fromISO)
      .lte(dateColumn, toISO)
      .order(dateColumn, { ascending: true })
      .order('id', { ascending: true })
  );

  return statusesToExclude.length > 0
    ? orders.filter((o: any) => !statusesToExclude.includes(o.status))
    : orders;
}

const PAGE_SIZE = 1000;

/**
 * Runs a query page by page until every row is loaded, so results are never
 * silently cut off at Supabase's 1000-row limit.
 *
 * `buildQuery` must return a fresh query each call and must sort by a unique
 * key (e.g. end with `.order('id')`), or rows can be skipped or repeated
 * where pages meet.
 */
export async function fetchAllPages<T = any>(
  buildQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }> }
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Fetches order items in chunks to avoid URL and filter size limits.
 */
export async function fetchOrderItemsForOrders(
  supabase: SupabaseClient,
  orderIds: string[],
  selectCols: string = 'order_id, product_id, product_name, quantity, selling_price_at_sale, cost_price_at_sale, products(name)'
): Promise<any[]> {
  const chunkSize = 200;
  const allItems: any[] = [];

  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunk = orderIds.slice(i, i + chunkSize);
    // Page within each chunk too, in case a batch of orders has over 1000 items.
    const items = await fetchAllPages(() =>
      supabase
        .from('order_items')
        .select(selectCols)
        .in('order_id', chunk)
        .order('id')
    );
    allItems.push(...items);
  }

  return allItems;
}

/**
 * Parses YYYY-MM-DD string into a local Date object.
 */
export function parseDateParam(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month, day);
}

/**
 * Formats a local Date object into YYYY-MM-DD.
 */
export function formatDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
