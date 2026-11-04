import type { SupabaseClient } from '@supabase/supabase-js';
import { CustomerReturnError, logEvent, notifyOwners, shortOrder } from './customer-return-service';

/*
 * Only one box of a multi-box order came back (owner, 2026-11-04;
 * docs/BUSINESS_WORKFLOW.md "Only one box came back"). The order isn't voided:
 *   resend -> the box's OK pieces become their own order (same customer,
 *             address, agent, order date), starting at Packed. The money moves
 *             with the box: its value leaves the original order; what was paid
 *             covers the delivered box first and the rest moves along.
 *   cancel -> the box's items come off the order (the sale only counts what
 *             the customer kept); OK pieces go back on the shelf.
 *
 * Stock (stored shelf stock triggers fire on order_items changes):
 *   reducing the original's lines   -> shelf_stock up (picked pieces "put back")
 *   + stock_level up by hand        -> movement 'adjustment' (not mirrored)
 *   new order at Packed             -> stock_level and shelf_stock down
 * So a re-send nets to zero, and a cancel nets to +OK pieces. Damaged pieces
 * of a cancelled box are taken back off the shelf number (they aren't there).
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const ORDER_SELECT = 'id, status, customer_id, sales_person_id, sales_person_name, order_date, created_at, payment_method, notes, '
  + 'subtotal, total_discount, insurance_fee, total_amount, amount_paid, balance_due, boxes_config, '
  + 'shipping_name, shipping_phone, shipping_address, delivery_instructions, '
  + 'order_items(id, product_id, product_name, quantity, selling_price_at_sale, unit_price, discount, price_type)';

/** A bundle counts as its parts for stock. */
async function explode(supabase: SupabaseClient, productId: string, qty: number) {
  const { data: p } = await supabase.from('products').select('assembly_recipe').eq('id', productId).maybeSingle();
  const recipe: any[] = Array.isArray(p?.assembly_recipe) ? p!.assembly_recipe : [];
  if (recipe.length === 0) return [{ id: productId, qty }];
  return recipe.map((c) => ({ id: c.productId || c.component_id, qty: qty * (Number(c.quantity) || 1) })).filter((t) => t.id);
}

/** stock_level up (shelf_stock is moved by the order_items trigger, so this movement isn't mirrored). */
async function stockLevelUp(supabase: SupabaseClient, productId: string, qty: number, reason: string, actorName: string) {
  for (const t of await explode(supabase, productId, qty)) {
    const { error } = await supabase.rpc('increment_stock', { p_product_id: t.id, qty: t.qty });
    if (error) throw error;
    await supabase.from('inventory_movements').insert({
      product_id: t.id, quantity_change: t.qty, movement_type: 'adjustment',
      timestamp: new Date().toISOString(), reason, performed_by_name: actorName,
    });
  }
}

/** Value of some pieces of an order line, and its share of the order's insurance. */
function moneyFor(order: any, moves: { line: any; qty: number }[]) {
  const sub = moves.reduce((s, m) => s + (Number(m.line.selling_price_at_sale ?? m.line.unit_price) || 0) * m.qty, 0);
  const disc = moves.reduce((s, m) => s + (Number(m.line.discount) || 0) * m.qty, 0);
  const base = (Number(order.subtotal) || 0) - (Number(order.total_discount) || 0);
  const ins = base > 0 ? round2((Number(order.insurance_fee) || 0) * (sub - disc) / base) : 0;
  return { sub: round2(sub), disc: round2(disc), ins, total: round2(sub - disc + ins) };
}

/** Takes these pieces off the original order's lines, boxes and totals. */
async function takeOffOrder(supabase: SupabaseClient, order: any, moves: { line: any; qty: number }[], boxNames: string | null) {
  for (const m of moves) {
    const left = (Number(m.line.quantity) || 0) - m.qty;
    const { error } = left > 0
      ? await supabase.from('order_items').update({ quantity: left }).eq('id', m.line.id)
      : await supabase.from('order_items').delete().eq('id', m.line.id);
    if (error) throw error;
  }
  const names = new Set((boxNames || '').split(',').map((b) => b.trim()).filter(Boolean));
  const boxes: any[] = Array.isArray(order.boxes_config) ? order.boxes_config : [];
  return { keptBoxes: boxes.filter((b) => !names.has(b.name)), movedBoxes: boxes.filter((b) => names.has(b.name)) };
}

async function loadOrder(supabase: SupabaseClient, orderId: string) {
  const { data, error } = await supabase.from('orders').select(ORDER_SELECT).eq('id', orderId).single();
  if (error || !data) throw new CustomerReturnError('Original order not found.');
  return data as any;
}

/** Pairs each case item with its order line (and how many pieces). */
function movesFor(order: any, items: any[], qtyOf: (i: any) => number) {
  const byId = new Map((order.order_items || []).map((l: any) => [l.id, l]));
  return items
    .map((i) => ({ line: byId.get(i.order_item_id), qty: qtyOf(i), item: i }))
    .filter((m): m is { line: any; qty: number; item: any } => !!m.line && m.qty > 0)
    .map((m) => ({ ...m, qty: Math.min(m.qty, Number(m.line.quantity) || 0) }));
}

async function claim(supabase: SupabaseClient, r: any, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('customer_returns')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', r.id).eq('updated_at', r.updated_at).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new CustomerReturnError('Someone else just changed this case. Refresh and try again.');
}

// ---------------------------------------------------------------------------
// Resend: the box becomes its own order
// ---------------------------------------------------------------------------

export async function resendBoxAsNewOrder(supabase: SupabaseClient, r: any, actorName: string): Promise<string> {
  if (!r.partial) throw new CustomerReturnError('This return is the whole order: use "Send back to For Shipping".');
  if (r.outcome !== 'reship') throw new CustomerReturnError('Sales has not chosen resend for this box.');
  if (!r.checked_at) throw new CustomerReturnError('Check the pieces first.');
  if (r.replacement_order_id || r.outcome_done_at) throw new CustomerReturnError('The re-send order was already made.');
  if (!r.shipping_payer) throw new CustomerReturnError('Sales has to pick who pays the shipping fee first.');

  const order = await loadOrder(supabase, r.order_id);
  const moves = movesFor(order, r.customer_return_items || [], (i) => Number(i.good_qty) || 0);
  if (moves.length === 0) throw new CustomerReturnError('No OK pieces to re-send. Damaged pieces go to the owners.');

  await claim(supabase, r, {});
  const money = moneyFor(order, moves);
  const newOrigTotal = round2((Number(order.total_amount) || 0) - money.total);
  const paid = Number(order.amount_paid) || 0;
  const keepPaid = round2(Math.min(paid, Math.max(0, newOrigTotal)));
  // What was paid covers the delivered box first; the rest moves with the re-sent box.
  const movedPaid = round2(Math.min(money.total, Math.max(0, paid - keepPaid)));
  const newBalance = round2(money.total - movedPaid);
  const origShort = shortOrder(order.id);

  // 1. The new order (same function as New Order: stock_level down; Packed takes it off the shelf).
  const { data: newId, error } = await supabase.rpc('process_order_transaction', {
    payload: {
      isEdit: false,
      customerId: order.customer_id,
      orderStatus: 'Packed',
      totalAmount: money.total,
      paymentType: newBalance > 0 ? 'COD' : 'Full Payment',
      shippingDetails: `Re-send of ${r.box_names || 'a returned box'} from order #${origShort} (return #${r.case_no}).`,
      installmentMonths: null,
      monthlyPayment: null,
      orderDate: order.order_date || order.created_at,
      subtotal: money.sub,
      totalDiscount: money.disc,
      insuranceFee: money.ins,
      balanceDue: money.total,
      salesPersonId: order.sales_person_id,
      salesPersonName: order.sales_person_name,
      platformFees: 0,
      trackingNumber: null,
      amountPaid: 0,
      proofUrl: null,
      orderItems: moves.map((m) => ({
        productId: m.line.product_id,
        productName: m.line.product_name,
        quantity: m.qty,
        costPriceAtSale: 0,
        sellingPriceAtSale: Number(m.line.selling_price_at_sale ?? m.line.unit_price) || 0,
        discount: Number(m.line.discount) || 0,
      })),
      overpayment: 0,
    },
  });
  if (error) throw error;
  const newOrderId = String(newId);
  const newShort = shortOrder(newOrderId);

  // 2. The original order keeps only what was delivered (+ any damaged pieces of the box).
  const { keptBoxes, movedBoxes } = await takeOffOrder(supabase, order, moves, r.box_names);
  for (const m of moves) {
    await stockLevelUp(supabase, m.line.product_id, m.qty, `Moved to re-send order #${newShort} (return #${r.case_no})`, actorName);
  }
  await supabase.from('orders').update({
    subtotal: round2((Number(order.subtotal) || 0) - money.sub),
    total_discount: round2((Number(order.total_discount) || 0) - money.disc),
    insurance_fee: round2((Number(order.insurance_fee) || 0) - money.ins),
    total_amount: newOrigTotal,
    amount_paid: keepPaid,
    balance_due: round2(newOrigTotal - keepPaid),
    boxes_config: keptBoxes.length > 0 ? keptBoxes : order.boxes_config,
  }).eq('id', order.id);

  // 3. The new order: address, shipping fee choice, the box, and any payment that moved.
  await supabase.from('orders').update({
    shipping_name: order.shipping_name,
    shipping_phone: order.shipping_phone,
    shipping_address: order.shipping_address,
    delivery_instructions: order.delivery_instructions,
    shipping_payment_type: r.shipping_payer === 'us' ? 'free shipping' : 'sf only',
    boxes_config: movedBoxes.length > 0
      ? movedBoxes.map((b, i) => ({ ...b, cod_amount: i === 0 ? newBalance : 0 }))
      : null,
    packed_at: new Date().toISOString(),
    amount_paid: movedPaid,
    balance_due: newBalance,
  }).eq('id', newOrderId);
  const priceTypes = new Map(moves.map((m) => [m.line.product_id, m.line.price_type]));
  for (const [productId, priceType] of priceTypes) {
    if (priceType) await supabase.from('order_items').update({ price_type: priceType }).eq('order_id', newOrderId).eq('product_id', productId);
  }
  if (movedPaid > 0) {
    const now = new Date().toISOString();
    await supabase.from('payments').insert([
      { order_id: order.id, amount: -movedPaid, payment_method: 'Order transfer', status: 'Verified', payment_date: now,
        notes: `Moved to re-send order #${newShort} (return #${r.case_no})` },
      { order_id: newOrderId, amount: movedPaid, payment_method: 'Order transfer', status: 'Verified', payment_date: now,
        notes: `Paid from order #${origShort} (return #${r.case_no})` },
    ]);
  }
  await supabase.from('order_logs').insert([
    { order_id: order.id, status: 'Box moved to re-send order', user_name: actorName, snapshot_data: { toOrderId: newOrderId, returnNo: r.case_no } },
    { order_id: newOrderId, status: 'Packed', user_name: actorName, snapshot_data: { fromOrderId: order.id, returnNo: r.case_no } },
  ]);

  // 4. The case is done (closing waits for any damaged pieces).
  const now = new Date().toISOString();
  await supabase.from('customer_returns').update({
    replacement_order_id: newOrderId, outcome_done_at: now, outcome_done_by_name: actorName,
    outcome_done_note: `Re-send order #${newShort}`, updated_at: now,
  }).eq('id', r.id);
  const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
  await logEvent(supabase, r.id, 'resend_order', actorName,
    `#${newShort}: ${moves.map((m) => `${m.qty}× ${m.line.product_name}`).join(', ')} · ${peso(money.total)}`
    + (movedPaid > 0 ? `, ${peso(movedPaid)} already paid moved from #${origShort}` : '')
    + ` · ${newBalance > 0 ? `COD ${peso(newBalance)}` : 'nothing to collect'}`);
  return newOrderId;
}

// ---------------------------------------------------------------------------
// Cancel: the box's items come off the order
// ---------------------------------------------------------------------------

/**
 * Staff tapped "Remove from order & put back on shelf" on a one-box cancel:
 * all of the box's pieces come off the order; OK pieces count back on the shelf,
 * damaged ones don't. If the customer had already paid for them, the owners
 * are told (refund or store credit).
 */
export async function removeBoxFromOrder(supabase: SupabaseClient, r: any, actorName: string) {
  const order = await loadOrder(supabase, r.order_id);
  const items: any[] = r.customer_return_items || [];
  const moves = movesFor(order, items, (i) => Number(i.qty) || 0);

  const { data: claimed } = await supabase.from('customer_returns')
    .update({ restocked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', r.id).is('restocked_at', null).select('id');
  if (!claimed || claimed.length === 0) return;

  const money = moneyFor(order, moves);
  const newTotal = round2((Number(order.total_amount) || 0) - money.total);
  const paid = Number(order.amount_paid) || 0;
  const { keptBoxes } = await takeOffOrder(supabase, order, moves, r.box_names);

  for (const m of moves) {
    const good = Math.min(Number(m.item.good_qty) || 0, m.qty);
    const damaged = Math.min(Number(m.item.damaged_qty) || 0, m.qty - good);
    if (good > 0) {
      await stockLevelUp(supabase, m.line.product_id, good, `Returned box put back on the shelf (return #${r.case_no}, order #${shortOrder(order.id)})`, actorName);
    }
    // Taking the line off the order put every piece back on the shelf number; damaged ones aren't there.
    if (damaged > 0) {
      for (const t of await explode(supabase, m.line.product_id, damaged)) {
        await supabase.rpc('change_shelf_stock', {
          p_product_id: t.id, p_qty: -t.qty, p_event: 'other', p_source_ref: `return:${r.id}:${m.line.id}:${t.id}`,
          p_order_id: order.id, p_order_item_id: null,
          p_reason: `Damaged pieces from return #${r.case_no} are not on the shelf`, p_actor: actorName,
        });
      }
    }
  }

  await supabase.from('orders').update({
    subtotal: round2((Number(order.subtotal) || 0) - money.sub),
    total_discount: round2((Number(order.total_discount) || 0) - money.disc),
    insurance_fee: round2((Number(order.insurance_fee) || 0) - money.ins),
    total_amount: newTotal,
    balance_due: round2(newTotal - paid),
    boxes_config: keptBoxes.length > 0 ? keptBoxes : order.boxes_config,
  }).eq('id', order.id);
  await supabase.from('order_logs').insert({
    order_id: order.id, status: 'Returned box removed', user_name: actorName,
    snapshot_data: { returnNo: r.case_no, items: moves.map((m) => `${m.qty}× ${m.line.product_name}`) },
  });

  const pieces = moves.map((m) => `${m.qty}× ${m.line.product_name}`).join(', ');
  const overpaid = round2(paid - newTotal);
  await logEvent(supabase, r.id, 'restocked', actorName,
    `Removed from order #${shortOrder(order.id)}: ${pieces}. Order is now ₱${newTotal.toLocaleString('en-PH')}`
    + (overpaid > 0 ? `; customer already paid ₱${overpaid.toLocaleString('en-PH')} more (owners: refund or store credit)` : ''));
  if (overpaid > 0) {
    await notifyOwners(supabase, `Return #${r.case_no}: customer paid for a box they didn't keep`,
      `Order #${shortOrder(order.id)}: ₱${overpaid.toLocaleString('en-PH')} was paid for ${pieces}. Refund or give store credit.`);
  }
}
