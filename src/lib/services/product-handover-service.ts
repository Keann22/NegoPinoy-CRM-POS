import { SupabaseClient } from '@supabase/supabase-js';
import { ALL_OPEN_STATUSES } from './procurement-service';

// When a plain product gets its first variants it becomes a parent, which is
// never sold or bought directly. Anything still open on it (orders, incoming
// purchases, stock) must move to the variant that is the same physical item,
// or Need to Buy and the in-transit chip split across two records.

export type ProductHistory = {
  openOrderLines: number;
  openPurchaseLines: number;
  stock: number;
};

async function openOrderItems(supabase: SupabaseClient, productId: string) {
  const { data, error } = await supabase
    .from('order_items')
    .select('id, order_id, orders!inner(status)')
    .eq('product_id', productId)
    .in('orders.status', ALL_OPEN_STATUSES);
  if (error) throw error;
  return data || [];
}

async function openPurchaseItems(supabase: SupabaseClient, productId: string) {
  // pending_receipt covers bought-not-yet-received lines and staff requests.
  const { data, error } = await supabase
    .from('purchase_order_items')
    .select('id')
    .eq('product_id', productId)
    .eq('status', 'pending_receipt');
  if (error) throw error;
  return data || [];
}

async function stockOf(supabase: SupabaseClient, productId: string): Promise<number> {
  const { data, error } = await supabase.from('products').select('stock_level').eq('id', productId).single();
  if (error) throw error;
  return Number(data?.stock_level) || 0;
}

export async function getProductHistory(supabase: SupabaseClient, productId: string): Promise<ProductHistory> {
  const [orders, purchases, stock] = await Promise.all([
    openOrderItems(supabase, productId),
    openPurchaseItems(supabase, productId),
    stockOf(supabase, productId),
  ]);
  return { openOrderLines: orders.length, openPurchaseLines: purchases.length, stock };
}

export async function moveProductHistory(
  supabase: SupabaseClient,
  fromId: string,
  toId: string,
  actorName: string,
) {
  const { data: to, error: toErr } = await supabase.from('products').select('id, parent_id').eq('id', toId).single();
  if (toErr) throw toErr;
  if (to.parent_id !== fromId) throw new Error('Target must be a variant of this product.');

  const orders = await openOrderItems(supabase, fromId);
  const movedOrderIds = Array.from(new Set(orders.map((o: any) => o.order_id)));
  if (orders.length) {
    const { error } = await supabase.from('order_items').update({ product_id: toId })
      .in('id', orders.map((o: any) => o.id)).eq('product_id', fromId);
    if (error) throw error;
  }

  // Issues follow their order; order-less ones (short delivery, staff notes)
  // follow the purchase line while still open.
  if (movedOrderIds.length) {
    const { error } = await supabase.from('order_issues').update({ product_id: toId })
      .eq('product_id', fromId).in('order_id', movedOrderIds);
    if (error) throw error;
  }
  const { error: looseErr } = await supabase.from('order_issues').update({ product_id: toId })
    .eq('product_id', fromId).is('order_id', null).eq('status', 'open');
  if (looseErr) throw looseErr;

  const purchases = await openPurchaseItems(supabase, fromId);
  if (purchases.length) {
    const { error } = await supabase.from('purchase_order_items').update({ product_id: toId })
      .in('id', purchases.map((p: any) => p.id)).eq('product_id', fromId);
    if (error) throw error;
  }

  // Stock: move each warehouse row, then settle any gap (products with no
  // warehouse rows, or rows that don't add up) with increment_stock, so the
  // parent ends at 0 and the variant gains exactly what the parent had.
  const fromStock = await stockOf(supabase, fromId);
  const toTarget = (await stockOf(supabase, toId)) + fromStock;
  if (fromStock !== 0) {
    const { data: rows, error } = await supabase.from('product_warehouse_stock')
      .select('warehouse_id, stock_level').eq('product_id', fromId).neq('stock_level', 0);
    if (error) throw error;
    for (const w of rows || []) {
      const qty = Number(w.stock_level);
      const a = await supabase.rpc('increment_warehouse_stock', { p_product_id: fromId, p_warehouse_id: w.warehouse_id, p_qty: -qty, p_new_unit_cost: null });
      if (a.error) throw a.error;
      const b = await supabase.rpc('increment_warehouse_stock', { p_product_id: toId, p_warehouse_id: w.warehouse_id, p_qty: qty, p_new_unit_cost: null });
      if (b.error) throw b.error;
    }
    const fromLeft = await stockOf(supabase, fromId);
    if (fromLeft !== 0) {
      const { error: e } = await supabase.rpc('increment_stock', { p_product_id: fromId, qty: -fromLeft, new_unit_cost: null });
      if (e) throw e;
    }
    const toGap = toTarget - (await stockOf(supabase, toId));
    if (toGap !== 0) {
      const { error: e } = await supabase.rpc('increment_stock', { p_product_id: toId, qty: toGap, new_unit_cost: null });
      if (e) throw e;
    }

    const reason = `Variants added: open orders, purchases and stock moved to variant by ${actorName}`;
    const { error: mvErr } = await supabase.from('inventory_movements').insert([
      { product_id: fromId, quantity_change: -fromStock, movement_type: 'adjustment', reason, performed_by_name: actorName },
      { product_id: toId, quantity_change: fromStock, movement_type: 'adjustment', reason, performed_by_name: actorName },
    ]);
    if (mvErr) throw mvErr;
  }

  return { orderLines: orders.length, purchaseLines: purchases.length, stock: fromStock };
}
