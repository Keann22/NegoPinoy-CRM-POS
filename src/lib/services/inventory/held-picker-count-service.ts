import { SupabaseClient } from '@supabase/supabase-js';
import { applyPhysicalShelfCount } from './inventory-guardian-action-service';
import { getShelfForProducts } from './picker-shelf-guard-service';
import type { HeldCountStatus, HeldPickerCount, OpenHeldCount } from '@/types/inventory-guardian.types';

/*
 * Held picker counts (owner, 2026-11-12; docs/BUSINESS_WORKFLOW.md "Picking when
 * the shelf says there's not enough").
 *
 * A picker's count that is HIGHER than the shelf number is not saved as stock.
 * Extra pieces almost always mean a delivery that was never recorded (found
 * 2026-11-11: an Acacia board with no purchase went 0 → 1 from a picker count;
 * 30 of 74 picker counts in 30 days added 132 pieces). The extra waits for the
 * owners: they record the purchase (Receiving then counts it in), approve it as
 * a counting mistake (the pieces are added), or ignore it.
 *
 * Stored in inventory_guardian_memory (action_type 'picker_count_held',
 * metadata.status open → purchase_recorded | approved | dismissed).
 * Owner counts (Admin/Owner picking) still go through right away.
 */

export const PICKER_COUNT_HELD_TITLE = 'Picker counted more: not added yet';
export const HELD_ACTION = 'picker_count_held';
const HELD_LINK = '/dashboard/reports/procurement';

interface HeldMeta {
  status?: HeldCountStatus;
  orderId?: string | null;
  unit1Count?: number | null;
  unit2Empty?: boolean;
  extra?: number;
  resolvedBy?: string;
  resolvedAt?: string;
}

interface HeldRow {
  id: string;
  product_id: string;
  physical_count: number | null;
  system_stock_before: number | null;
  discrepancy: number | null;
  actor_name: string | null;
  metadata: HeldMeta | null;
  created_at: string;
  products: { name: string } | { name: string }[] | null;
}

interface UserRow { raw_user_meta_data?: { first_name?: string; last_name?: string; roles?: string[]; role?: string } }

interface PoItemRow {
  created_at: string;
  expected_qty: number | null;
  received_qty: number | null;
  purchase_orders: { notes: string | null } | { notes: string | null }[] | null;
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

async function ownerNames(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_all_users');
  if (error) return [];
  return Array.from(new Set(
    ((data || []) as UserRow[])
      .filter((u) => {
        const meta = u.raw_user_meta_data || {};
        const roles: string[] = Array.isArray(meta.roles) ? meta.roles : meta.role ? [meta.role] : [];
        return roles.some((r) => ['owner', 'admin'].includes(String(r).toLowerCase()));
      })
      .map((u) => `${u.raw_user_meta_data?.first_name || ''} ${u.raw_user_meta_data?.last_name || ''}`.trim())
      .filter(Boolean)
  ));
}

/** Saves the held count and tells the owners. Stock is not touched. */
export async function holdPickerCount(
  supabase: SupabaseClient,
  input: { productId: string; counted: number; systemHad: number; unit1Count: number | null; unit2Empty: boolean; orderId: string | null; actorName: string; note: string }
): Promise<string> {
  const extra = input.counted - input.systemHad;
  const metadata: HeldMeta = { status: 'open', orderId: input.orderId, unit1Count: input.unit1Count, unit2Empty: input.unit2Empty, extra };
  const { data: row, error } = await supabase
    .from('inventory_guardian_memory')
    .insert({
      product_id: input.productId,
      action_type: HELD_ACTION,
      physical_count: input.counted,
      system_stock_before: input.systemHad,
      discrepancy: extra,
      actor_name: input.actorName,
      notes: `${input.note} Held: ${extra} more than the shelf number, waiting for the owners.`,
      metadata,
    })
    .select('id')
    .single();
  if (error || !row) throw error || new Error('Could not save the count');

  const { data: p } = await supabase.from('products').select('name').eq('id', input.productId).maybeSingle();
  const orderTag = input.orderId ? ` #${input.orderId.slice(0, 8).toUpperCase()}` : '';
  const message = `${p?.name || 'An item'}: ${input.actorName} counted ${input.counted} while picking${orderTag}; the system has ${input.systemHad}. The extra ${extra} was not added: record the purchase, or approve it as a counting mistake.`;
  const names = await ownerNames(supabase);
  if (names.length > 0) {
    await supabase.from('notifications').insert(names.map((name) => ({
      sales_person_name: name,
      title: PICKER_COUNT_HELD_TITLE,
      message: message.length > 240 ? `${message.slice(0, 237)}...` : message,
      link: `${HELD_LINK}?heldCount=${row.id}`,
      is_read: false,
    })));
  }
  return row.id as string;
}

/** The held count id from a bell notification's link. */
export function heldCountIdFromLink(link: string | null | undefined): string | null {
  const m = String(link || '').match(/[?&]heldCount=([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

export async function getHeldPickerCount(supabase: SupabaseClient, id: string): Promise<HeldPickerCount | null> {
  const { data } = await supabase
    .from('inventory_guardian_memory')
    .select('id, product_id, physical_count, system_stock_before, discrepancy, actor_name, metadata, created_at, products(name)')
    .eq('id', id)
    .eq('action_type', HELD_ACTION)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as HeldRow;
  const meta: HeldMeta = row.metadata || {};

  const [orderRes, poRes, shelf] = await Promise.all([
    meta.orderId
      ? supabase.from('orders').select('id, status').eq('id', meta.orderId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('purchase_order_items')
      .select('created_at, expected_qty, received_qty, purchase_orders!inner(notes)')
      .eq('product_id', row.product_id)
      .gt('created_at', row.created_at)
      .order('created_at', { ascending: true })
      .limit(20),
    getShelfForProducts(supabase, [row.product_id]).catch(() => ({} as Record<string, { unallocated: number }>)),
  ]);
  const o = orderRes.data as { id: string; status: string } | null;
  // Staff requests are a shopping list, not purchases.
  const purchasesSince = ((poRes.data || []) as unknown as PoItemRow[])
    .filter((r) => one(r.purchase_orders)?.notes !== 'STAFF_DRAFT')
    .map((r) => ({ at: r.created_at, qty: Number(r.expected_qty) || 0, received: Number(r.received_qty) || 0 }));

  return {
    id: row.id,
    productId: row.product_id,
    productName: one(row.products)?.name || 'Item',
    pickerName: row.actor_name || 'A picker',
    counted: Number(row.physical_count) || 0,
    systemHad: Number(row.system_stock_before) || 0,
    extra: Number(row.discrepancy) || 0,
    countedAt: row.created_at,
    status: meta.status || 'open',
    resolvedBy: meta.resolvedBy || null,
    resolvedAt: meta.resolvedAt || null,
    order: o ? { id: o.id, shortId: String(o.id).slice(0, 8).toUpperCase(), status: o.status } : null,
    purchasesSince,
    shelfNow: shelf[row.product_id]?.unallocated ?? null,
  };
}

/**
 * Owner decision on a held count:
 *  - 'approve': it was a counting mistake; the extra pieces are added to what is
 *    on the shelf NOW (not the old count, since picks/receiving may have happened).
 *  - 'purchase': the purchase is recorded; Receiving counts it in. Nothing changes here.
 *  - 'dismiss': wrong item / not real; nothing changes.
 */
export async function resolveHeldPickerCount(
  supabase: SupabaseClient,
  id: string,
  action: 'approve' | 'purchase' | 'dismiss',
  actorName: string
): Promise<HeldPickerCount | null> {
  const held = await getHeldPickerCount(supabase, id);
  if (!held) throw new Error('Held count not found');
  if (held.status !== 'open') throw new Error('Already handled');

  // Mark it first so a double tap can't add the pieces twice.
  const { data: row } = await supabase.from('inventory_guardian_memory').select('metadata').eq('id', id).single();
  const status: HeldCountStatus = action === 'approve' ? 'approved' : action === 'purchase' ? 'purchase_recorded' : 'dismissed';
  const { data: claimed } = await supabase
    .from('inventory_guardian_memory')
    .update({ metadata: { ...((row?.metadata as HeldMeta) || {}), status, resolvedBy: actorName, resolvedAt: new Date().toISOString() } })
    .eq('id', id)
    .eq('metadata->>status', 'open')
    .select('id');
  if (!claimed || claimed.length === 0) throw new Error('Already handled');

  if (action === 'approve') {
    const shelf = (await getShelfForProducts(supabase, [held.productId]))[held.productId];
    const now = shelf?.unallocated ?? 0;
    const target = now + held.extra;
    const tag = held.order ? ` #${held.order.shortId}` : '';
    await applyPhysicalShelfCount(supabase, {
      productId: held.productId,
      physicalShelfCount: target,
      notes: `Owner ${actorName} approved a held picker count (counting mistake): ${held.pickerName} counted ${held.counted} while picking${tag}, system had ${held.systemHad}. +${held.extra} (shelf ${now} → ${target}).`,
      actorName,
    });
  }
  return getHeldPickerCount(supabase, id);
}

/** Open held counts per product (latest first). Receiving shows them on the matching line. */
export async function getOpenHeldCounts(supabase: SupabaseClient, productIds: string[]): Promise<Map<string, OpenHeldCount>> {
  const out = new Map<string, OpenHeldCount>();
  if (productIds.length === 0) return out;
  const { data } = await supabase
    .from('inventory_guardian_memory')
    .select('id, product_id, discrepancy, actor_name, metadata, created_at')
    .eq('action_type', HELD_ACTION)
    .eq('metadata->>status', 'open')
    .in('product_id', productIds)
    .order('created_at', { ascending: false });
  ((data || []) as unknown as HeldRow[]).forEach((r) => {
    if (out.has(r.product_id)) return;
    out.set(r.product_id, { id: r.id, at: r.created_at, extra: Number(r.discrepancy) || 0, byName: r.actor_name || 'A picker', orderId: r.metadata?.orderId || null });
  });
  return out;
}
