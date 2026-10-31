import { SupabaseClient } from '@supabase/supabase-js';
import { getUnpickedQtyForProduct, unallocatedFromStockLevel } from './shelf-stock-service';
import { applyPhysicalShelfCount } from './inventory-guardian-action-service';
import type { PickerShelfInfo } from '@/types/inventory-guardian.types';

/*
 * Picker shelf guard (owner rule 2026-10-31, docs/BUSINESS_WORKFLOW.md
 * "Picking when the shelf says there's not enough").
 *
 *   - A picker can't tap Found for more than unallocated stock without counting
 *     the Unit 1 shelf; the count is saved like a Guardian count.
 *   - A picker can't borrow while unallocated stock is above 0 until they
 *     confirm Unit 1 and Unit 2 are both empty (saved as a count of 0).
 *
 * Unallocated stock (LOCKED formula) covers both units. Unit 2 reserve has no
 * orders against it, so its share is simply its stock; the picker counts Unit 1
 * and Unit 2 is kept as recorded.
 */

export type ShelfInfo = PickerShelfInfo;

async function unit2Stock(supabase: SupabaseClient, productIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (productIds.length === 0) return map;
  const { data: wh } = await supabase.from('warehouses').select('id').eq('code', 'UNIT2').maybeSingle();
  if (!wh) return map;
  const { data } = await supabase
    .from('product_warehouse_stock').select('product_id, stock_level').eq('warehouse_id', wh.id).in('product_id', productIds);
  (data || []).forEach((r: any) => map.set(r.product_id, Math.max(0, Number(r.stock_level) || 0)));
  return map;
}

/** Shelf numbers for the products on one order (a handful, so per-product queries are fine). */
export async function getShelfForProducts(supabase: SupabaseClient, productIds: string[]): Promise<Record<string, ShelfInfo>> {
  const ids = Array.from(new Set(productIds.filter(Boolean))).slice(0, 60);
  const [{ data: products }, u2] = await Promise.all([
    supabase.from('products').select('id, stock_level').in('id', ids),
    unit2Stock(supabase, ids),
  ]);
  const out: Record<string, ShelfInfo> = {};
  await Promise.all((products || []).map(async (p: any) => {
    const unpicked = await getUnpickedQtyForProduct(supabase, p.id);
    out[p.id] = { unallocated: unallocatedFromStockLevel(p.stock_level, unpicked.qty), unit2: u2.get(p.id) || 0 };
  }));
  return out;
}

/**
 * Pieces of each product this order has already taken off the shelf, from the
 * database's own rules (shelf_order_targets, same as the shelf-stock trigger).
 * On a re-pick of a Picked (with issue) order only the OS pieces still need the shelf.
 */
export async function getOrderPickedQty(supabase: SupabaseClient, orderId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('shelf_order_targets', { p_order_id: orderId });
  if (error) throw error;
  const out: Record<string, number> = {};
  (data || []).forEach((r: any) => { out[r.product_id] = Number(r.qty) || 0; });
  return out;
}

async function notifyOwners(supabase: SupabaseClient, title: string, message: string) {
  const { data, error } = await supabase.rpc('get_all_users');
  if (error) return;
  const names = Array.from(new Set(
    (data || [])
      .filter((u: any) => {
        const meta = u.raw_user_meta_data || {};
        const roles: string[] = Array.isArray(meta.roles) ? meta.roles : meta.role ? [meta.role] : [];
        return roles.some((r) => ['owner', 'admin'].includes(String(r).toLowerCase()));
      })
      .map((u: any) => `${u.raw_user_meta_data?.first_name || ''} ${u.raw_user_meta_data?.last_name || ''}`.trim())
      .filter(Boolean)
  ));
  if (names.length === 0) return;
  await supabase.from('notifications').insert(names.map((name) => ({
    sales_person_name: name,
    title,
    message: message.length > 240 ? `${message.slice(0, 237)}...` : message,
    link: '/dashboard/inventory/purchases-receipts',
    is_read: false,
  })));
}

/**
 * Saves a count made while picking. `unit1Count` = pieces on the Unit 1 shelf
 * including the ones in the picker's hand; Unit 2 is kept as recorded.
 * `bothEmpty` = the picker checked Unit 1 and Unit 2 before borrowing: Unit 2 is
 * zeroed too and the count is 0.
 */
export async function savePickerShelfCount(
  supabase: SupabaseClient,
  input: { productId: string; unit1Count?: number; bothEmpty?: boolean; orderId?: string | null; actorName: string }
): Promise<{ before: number; after: number }> {
  const { productId, actorName } = input;
  const orderTag = input.orderId ? ` #${input.orderId.slice(0, 8).toUpperCase()}` : '';
  const before = (await getShelfForProducts(supabase, [productId]))[productId];
  if (!before) throw new Error('Product not found');

  let total: number;
  if (input.bothEmpty) {
    if (before.unit2 > 0) {
      // Unit 2 is empty too: zero its row (the totals trigger updates stock_level) and log it.
      const { data: wh } = await supabase.from('warehouses').select('id').eq('code', 'UNIT2').maybeSingle();
      if (wh) {
        await supabase.from('product_warehouse_stock').update({ stock_level: 0 }).eq('product_id', productId).eq('warehouse_id', wh.id);
        await supabase.from('inventory_movements').insert({
          product_id: productId,
          quantity_change: -before.unit2,
          movement_type: 'adjustment',
          warehouse_id: wh.id,
          timestamp: new Date().toISOString(),
          reason: `Picker checked Unit 2 before borrowing${orderTag}: empty (was ${before.unit2}). ${actorName}`,
          performed_by_name: actorName,
        });
      }
    }
    total = 0;
  } else {
    const n = Math.round(Number(input.unit1Count));
    if (!(n >= 0) || n > 100000) throw new Error('Enter how many are on the shelf.');
    total = n + before.unit2;
  }

  const note = input.bothEmpty
    ? `Picker checked Unit 1 and Unit 2 before borrowing${orderTag}: both empty.`
    : `Counted by picker while picking${orderTag}: Unit 1 ${total - before.unit2}${before.unit2 ? ` + Unit 2 ${before.unit2} (kept)` : ''}.`;
  await applyPhysicalShelfCount(supabase, { productId, physicalShelfCount: total, notes: note, actorName });

  if (total > before.unallocated) {
    const { data: p } = await supabase.from('products').select('name').eq('id', productId).maybeSingle();
    await notifyOwners(supabase, 'Picker found more than the system expected',
      `${p?.name || 'An item'}: ${actorName} counted ${total} while picking${orderTag}; the system expected ${before.unallocated}. A purchase may not be recorded.`);
  }
  return { before: before.unallocated, after: total };
}
