import ExcelJS from 'exceljs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RemittanceResult } from '@/types/accounting.types';

export interface TrackingItem {
  originalTrackingNo: string;
  cod: number;
  shippingFee: number;
  processingFee: number;
}

export interface MatchedOrderWork {
  order: any;
  joinedTracking: string;
  shortOrderId: string;
  totalCod: number;
  totalAvailableCod: number;
  totalShippingFee: number;
  totalProcessingFee: number;
  isAlreadySettled: boolean;
  settledMessage: string;
}

/**
 * Parses an SPX Remittance Account Transaction List Excel file.
 * Groups transactions by tracking number and extracts COD amounts and fees.
 */
export async function parseSPXRemittanceWorkbook(fileBuffer: ArrayBuffer): Promise<Map<string, TrackingItem>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.worksheets[0];

  let headersFound = false;
  let trackingCol = -1;
  let typeCol = -1;
  let amountCol = -1;

  const trackingData = new Map<string, TrackingItem>();

  worksheet.eachRow((row) => {
    if (!headersFound) {
      row.eachCell((cell, colNumber) => {
        const val = cell.value?.toString().toLowerCase().trim() || '';
        if (val === 'tracking number') trackingCol = colNumber;
        else if (val === 'transaction type') typeCol = colNumber;
        else if (val.includes('transaction amount')) amountCol = colNumber;
      });

      if (trackingCol !== -1 && typeCol !== -1 && amountCol !== -1) {
        headersFound = true;
      }
      return;
    }

    const rawTracking = row.getCell(trackingCol).value?.toString().trim();
    // Ignore rows without tracking numbers or with '-' placeholder (e.g. wallet releases, deposits, lumped billing)
    if (!rawTracking || rawTracking === '-' || rawTracking.toLowerCase() === 'n/a') {
      return;
    }

    const key = rawTracking.toUpperCase();
    const type = row.getCell(typeCol).value?.toString().toLowerCase().trim() || '';
    const amount = parseFloat(row.getCell(amountCol).value?.toString().replace(/,/g, '') || '0');

    if (!trackingData.has(key)) {
      trackingData.set(key, { originalTrackingNo: rawTracking, cod: 0, shippingFee: 0, processingFee: 0 });
    }
    const item = trackingData.get(key)!;

    if (type === 'cod') {
      item.cod += amount;
    } else if (type.includes('shipping fee refund')) {
      item.shippingFee += amount; // Offsets shipping fee deductions
    } else if (type.includes('shipping fee')) {
      item.shippingFee += amount; // Courier shipping charge (negative)
    } else if (type.includes('cod service fee refund')) {
      item.processingFee += amount; // Offsets processing fee deductions
    } else if (amount < 0) {
      item.processingFee += amount; // Other negative adjustments/fees
    }
  });

  return trackingData;
}

/**
 * Fetches all orders with tracking numbers, paginating past PostgREST's default 1000-row limit.
 */
export async function fetchAllOrdersWithTracking(
  supabase: SupabaseClient,
  onProgress?: (count: number) => void
): Promise<any[]> {
  const allOrders: any[] = [];
  const pageSize = 1000;
  let page = 0;

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, tracking_number, balance_due, amount_paid, status, total_amount, payment_method, installment_months, monthly_payment, payments(id, payment_method, amount)')
      .not('tracking_number', 'is', null)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allOrders.push(...data);
    onProgress?.(allOrders.length);

    if (data.length < pageSize) break;
    page++;
  }

  return allOrders;
}

/**
 * Fetches existing SPX fee expense descriptions, paginating past PostgREST's 1000-row limit.
 */
export async function fetchRecordedSPXFeeOrders(supabase: SupabaseClient): Promise<Set<string>> {
  const recordedOrderIds = new Set<string>();
  const pageSize = 1000;
  let page = 0;

  while (true) {
    const { data, error } = await supabase
      .from('expenses')
      .select('description')
      .ilike('description', 'SPX%Fee for Order #%')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    data.forEach((e: any) => {
      const match = e.description?.match(/Order #(\w+)/);
      if (match) recordedOrderIds.add(match[1]);
    });

    if (data.length < pageSize) break;
    page++;
  }

  return recordedOrderIds;
}

/**
 * Executes async tasks with controlled concurrency.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  workerFn: (item: T, index: number) => Promise<R>,
  onProgress?: (completed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;
  let completed = 0;

  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await workerFn(items[idx], idx);
      completed++;
      onProgress?.(completed, items.length);
    }
  });

  await Promise.all(workers);
  return results;
}
