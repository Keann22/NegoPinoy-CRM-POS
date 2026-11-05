import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOpenOrderIssues } from '@/lib/services/order-issues-service';
import { notifyOwners } from '@/lib/services/customer-returns/customer-return-service';
import { BUS_SHIPPABLE_STATUSES, type SaveBusShipmentInput, type SaveBusShipmentResult } from '@/types/bus-shipping.types';
import { busSfResult, busTrackingText, round2 } from './bus-fee-rules';
import { BUS_ORDER_COLUMNS, shortOrder, toCandidate, type BusOrderRow } from './bus-order-search';

/**
 * Saving one bus trip (owner, 2026-11-05): staff paid the bus company at the
 * terminal. In one go: each order's shipping fee goes up by its share (so its
 * total and balance do too), the orders are marked Shipped with the bus as the
 * tracking text, one "Shipping Fee" expense is recorded, and SF the customer
 * sent in advance (now in store credit) is used for the fee. Any failure undoes it.
 */

export class BusShipmentError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export const BUS_EXPENSE_CATEGORY = 'Shipping Fee';
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: unknown) => Number(v || 0);

export async function saveBusShipment(
  supabase: SupabaseClient,
  input: SaveBusShipmentInput,
  actorName: string,
): Promise<SaveBusShipmentResult> {
  const busCompany = String(input.busCompany || '').trim();
  const destination = String(input.destination || '').trim();
  const fee = round2(Number(input.fee));
  const shares = (input.shares || []).map((s) => ({ orderId: String(s.orderId), amount: round2(Number(s.amount) || 0) }));
  const freeShipping = !!input.freeShipping;
  if (!busCompany) throw new BusShipmentError('Pick the bus company.');
  if (!destination) throw new BusShipmentError('Enter where it is going (terminal / town).');
  if (!(fee > 0)) throw new BusShipmentError('Enter the fee you paid the bus company.');
  if (shares.length === 0) throw new BusShipmentError('Tick the orders that went on this bus.');
  if (new Set(shares.map((s) => s.orderId)).size !== shares.length) throw new BusShipmentError('An order is listed twice.');
  if (shares.some((s) => s.amount < 0)) throw new BusShipmentError('A share can’t be below ₱0.');
  const sharesTotal = round2(shares.reduce((s, x) => s + x.amount, 0));
  if (Math.abs(sharesTotal - fee) > 0.01) {
    throw new BusShipmentError(`The orders' shares add up to ${peso(sharesTotal)}, but the fee is ${peso(fee)}.`);
  }

  const { data, error } = await supabase.from('orders').select(BUS_ORDER_COLUMNS).in('id', shares.map((s) => s.orderId));
  if (error) throw error;
  const rows = new Map(((data || []) as unknown as BusOrderRow[]).map((o) => [o.id, o]));
  if (rows.size !== shares.length) throw new BusShipmentError('One of the orders was not found. Reload and try again.', 404);
  const customerIds = new Set([...rows.values()].map((o) => o.customer_id));
  if (customerIds.size > 1) throw new BusShipmentError('One bus trip can only carry orders of the same customer.');
  const customerId = [...customerIds][0] || null;
  for (const o of rows.values()) {
    if (!BUS_SHIPPABLE_STATUSES.includes(o.status)) throw new BusShipmentError(`#${shortOrder(o.id)} is ${o.status}; it can't ship yet.`);
  }
  const { data: already } = await supabase.from('bus_shipment_orders').select('order_id').in('order_id', [...rows.keys()]);
  if (already && already.length > 0) {
    throw new BusShipmentError(`#${shortOrder(already[0].order_id)} already has a bus fee recorded.`);
  }

  let storeCredit = 0;
  if (customerId) {
    const { data: c } = await supabase.from('customers').select('store_credit').eq('id', customerId).single();
    storeCredit = num(c?.store_credit);
  }
  const candidates = shares.map((s) => toCandidate(rows.get(s.orderId)!, null));
  const result = busSfResult(candidates, shares, storeCredit, freeShipping);
  const trackingText = busTrackingText(busCompany, destination);
  const now = new Date().toISOString();
  const agent = candidates.map((c) => c.salesPersonName).find(Boolean) || null;
  const customerName = candidates[0].customerName;
  const orderList = shares.map((s) => `#${shortOrder(s.orderId)}`).join(', ');

  const { data: shipment, error: shipError } = await supabase.from('bus_shipments').insert({
    bus_company: busCompany,
    destination,
    fee,
    weight_kg: input.weightKg && input.weightKg > 0 ? round2(input.weightKg) : null,
    declared_value: input.declaredValue && input.declaredValue > 0 ? round2(input.declaredValue) : null,
    box_count: input.boxCount && input.boxCount > 0 ? Math.round(input.boxCount) : null,
    receipt_url: input.receiptUrl || null,
    free_shipping: freeShipping,
    customer_id: customerId,
    sales_person_name: agent,
    advance_sf: result.advance,
    credit_used: result.creditUsed,
    sf_owed: result.owed,
    sf_extra: result.extra,
    // Nothing for sales to do: settled right away.
    settled_at: result.owed <= 0.009 && result.extra <= 0.009 ? now : null,
    settled_by_name: result.owed <= 0.009 && result.extra <= 0.009 ? 'System' : null,
    recorded_by_name: actorName,
    shipped_at: now,
  }).select('id').single();
  if (shipError) throw shipError;
  const shipmentId = shipment.id as string;

  const undo: { id: string; before: Record<string, unknown> }[] = [];
  let creditTaken = 0;
  let expenseId: string | null = null;
  const rollback = async () => {
    for (const u of undo) await supabase.from('orders').update(u.before).eq('id', u.id);
    if (creditTaken > 0 && customerId) {
      const { data: c } = await supabase.from('customers').select('store_credit').eq('id', customerId).single();
      await supabase.from('customers').update({ store_credit: num(c?.store_credit) + creditTaken }).eq('id', customerId);
    }
    if (expenseId) await supabase.from('expenses').delete().eq('id', expenseId);
    await supabase.from('bus_shipments').delete().eq('id', shipmentId);
  };

  let balanceAfter = 0;
  try {
    const { error: linkError } = await supabase.from('bus_shipment_orders')
      .insert(shares.map((s) => ({ shipment_id: shipmentId, order_id: s.orderId, fee_share: s.amount })));
    if (linkError) throw linkError;

    for (const s of shares) {
      const o = rows.get(s.orderId)!;
      const charge = freeShipping ? 0 : s.amount;
      const newTotal = round2(num(o.total_amount) + charge);
      const newBalance = round2(Math.max(0, newTotal - num(o.amount_paid)));
      balanceAfter = round2(balanceAfter + newBalance);
      const before = {
        shipping_fee: o.shipping_fee, total_amount: o.total_amount, balance_due: o.balance_due,
        status: o.status, tracking_number: o.tracking_number,
      };
      // Only if nobody changed the order's money since we read it.
      let update = supabase.from('orders').update({
        shipping_fee: round2(num(o.shipping_fee) + charge),
        total_amount: newTotal,
        balance_due: newBalance,
        status: 'Shipped',
        tracking_number: trackingText,
        not_for_shipping_reason: null,
        ...(o.status === 'Shipped' ? {} : { shipped_at: now }),
      }).eq('id', o.id).eq('total_amount', num(o.total_amount));
      update = o.amount_paid === null ? update.is('amount_paid', null) : update.eq('amount_paid', num(o.amount_paid));
      const { data: updated, error: updateError } = await update.select('id');
      if (updateError) throw updateError;
      if (!updated || updated.length === 0) {
        throw new BusShipmentError(`#${shortOrder(o.id)} was changed by someone else just now. Try again.`, 409);
      }
      undo.push({ id: o.id, before });
    }

    if (result.creditUsed > 0 && customerId) {
      const { data: credited, error: creditError } = await supabase.from('customers')
        .update({ store_credit: round2(storeCredit - result.creditUsed) }).eq('id', customerId).eq('store_credit', storeCredit)
        .select('id');
      if (creditError) throw creditError;
      if (!credited || credited.length === 0) {
        throw new BusShipmentError("The customer's store credit changed just now. Try again.", 409);
      }
      creditTaken = result.creditUsed;
    }

    const { data: expense, error: expenseError } = await supabase.from('expenses').insert({
      expense_date: now,
      category: BUS_EXPENSE_CATEGORY,
      amount: fee,
      description: `Bus SF: ${busCompany} → ${destination} · ${orderList} · ${customerName}${freeShipping ? ' · free shipping (we pay)' : ''}`,
    }).select('id').single();
    if (expenseError) throw expenseError;
    expenseId = expense.id as string;

    const { error: finishError } = await supabase.from('bus_shipments')
      .update({ expense_id: expenseId, balance_after: balanceAfter }).eq('id', shipmentId);
    if (finishError) throw finishError;
  } catch (err) {
    await rollback();
    throw err;
  }

  // Logs and follow-ups: the trip is saved, so these don't undo it.
  for (const s of shares) {
    const o = rows.get(s.orderId)!;
    await supabase.from('order_logs').insert({
      order_id: s.orderId,
      status: 'Shipped',
      user_name: actorName,
      snapshot_data: {
        bus_shipment_id: shipmentId, bus_company: busCompany, destination,
        trip_fee: fee, fee_share: s.amount, free_shipping: freeShipping, tracking_before: o.tracking_number,
      },
    });
    await resolveOpenOrderIssues(supabase, s.orderId, actorName);
  }
  if (result.creditShort > 0.009) {
    await notifyOwners(
      supabase,
      'Bus SF: advance SF no longer in store credit',
      `${customerName} (${orderList}) had paid ${peso(result.advance)} above the items, but their store credit was only ` +
        `${peso(storeCredit)}. ${peso(result.creditShort)} of the SF was covered by money no longer in store credit. Please check.`,
      undefined,
      '/dashboard/bus-shipping',
    );
  }
  return { shipmentId, trackingText, ...result };
}
