import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * "To follow" items: things a customer is still owed from an earlier order,
 * sent with their next order. When a paid item is removed from an order, the
 * money already becomes store credit (process_order_transaction); a carry-over
 * remembers WHICH item that credit is for, so the next order can include it.
 */

export const CARRYOVER_TABLE = 'customer_carryovers';

export interface CarryOver {
  id: string;
  customerId: string;
  customerName: string | null;
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  fromOrderId: string | null;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface CarryOverItemInput {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
}

function toCarryOver(r: any): CarryOver {
  return {
    id: r.id,
    customerId: r.customer_id,
    customerName: r.customers?.full_name ?? null,
    productId: r.product_id,
    productName: r.product_name,
    qty: Number(r.qty),
    unitPrice: Number(r.unit_price || 0),
    unitCost: Number(r.unit_cost || 0),
    fromOrderId: r.from_order_id,
    note: r.note,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
  };
}

/** Open carry-overs, for one customer or all of them (oldest first). */
export async function listOpenCarryOvers(supabase: SupabaseClient, customerId?: string): Promise<CarryOver[]> {
  let query = supabase
    .from(CARRYOVER_TABLE)
    .select('*, customers(full_name)')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(1000);
  if (customerId) query = query.eq('customer_id', customerId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(toCarryOver);
}

/**
 * Records items to follow from an order. Skips products that already have an
 * open carry-over from the same order (e.g. made by the OS decision before the
 * order was edited), so the two ways in never double up.
 */
export async function createCarryOvers(
  supabase: SupabaseClient,
  input: { customerId: string; fromOrderId: string; note?: string | null; items: CarryOverItemInput[] },
  editor: { id: string; name: string }
): Promise<CarryOverItemInput[]> {
  const items = input.items.filter((i) => i.qty > 0);
  if (items.length === 0) return [];

  const { data: existing, error: exErr } = await supabase
    .from(CARRYOVER_TABLE)
    .select('product_id')
    .eq('from_order_id', input.fromOrderId)
    .eq('status', 'open');
  if (exErr) throw exErr;
  const already = new Set((existing || []).map((r: any) => r.product_id));

  const fresh = items.filter((i) => !already.has(i.productId));
  const rows = fresh
    .map((i) => ({
      customer_id: input.customerId,
      product_id: i.productId,
      product_name: i.productName,
      qty: i.qty,
      unit_price: i.unitPrice,
      unit_cost: i.unitCost,
      from_order_id: input.fromOrderId,
      note: input.note?.trim() || null,
      created_by_id: editor.id,
      created_by_name: editor.name,
    }));
  if (rows.length === 0) return [];

  const { error } = await supabase.from(CARRYOVER_TABLE).insert(rows);
  if (error) throw error;
  return fresh;
}

/**
 * Puts to-follow items on the buy list as a request not tied to an order (the
 * same call the picker makes on an OS scan). Only for items that were OS.
 */
export async function requestBuyForCarryOvers(
  baseUrl: string,
  items: { productId: string; qty: number }[],
  byName: string
): Promise<void> {
  if (items.length === 0) return;
  const res = await fetch(new URL('/api/inventory/procurement-request', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: items.map((i) => ({ productId: i.productId, requestedQty: i.qty })), requestedByName: byName }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Saved as to follow, but the buy request failed: ${data.error || res.statusText}`);
  }
}

/** Marks carry-overs as added to a new order, or cancelled. */
export async function closeCarryOvers(
  supabase: SupabaseClient,
  input: { ids: string[]; status: 'added' | 'cancelled'; orderId?: string | null },
  editor: { name: string }
): Promise<void> {
  if (input.ids.length === 0) return;
  const { error } = await supabase
    .from(CARRYOVER_TABLE)
    .update({
      status: input.status,
      added_to_order_id: input.status === 'added' ? input.orderId : null,
      closed_by_name: editor.name,
      closed_at: new Date().toISOString(),
    })
    .in('id', input.ids)
    .eq('status', 'open');
  if (error) throw error;
}

/** What one unit of a product cost the customer on an order (price minus per-unit discount), and its cost. */
export async function orderLinePrice(
  supabase: SupabaseClient,
  orderId: string,
  productId: string
): Promise<{ unitPrice: number; unitCost: number; productName: string; qty: number } | null> {
  const { data } = await supabase
    .from('order_items')
    .select('product_name, quantity, selling_price_at_sale, unit_price, discount, cost_price_at_sale')
    .eq('order_id', orderId)
    .eq('product_id', productId);
  const line = (data || [])[0];
  if (!line) return null;
  const price = Number(line.selling_price_at_sale ?? line.unit_price ?? 0);
  return {
    unitPrice: Math.max(0, price - Number(line.discount || 0)),
    unitCost: Number(line.cost_price_at_sale || 0),
    productName: line.product_name,
    qty: (data || []).reduce((s: number, l: any) => s + Number(l.quantity || 0), 0),
  };
}
