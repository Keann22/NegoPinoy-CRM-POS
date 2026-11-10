import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyOwners } from '@/lib/services/customer-returns/customer-return-service';
import type { BusSfAnswer, BusSfPrompt, BusTrip } from '@/types/bus-shipping.types';
import { round2 } from './bus-fee-rules';
import { shortOrder } from './bus-order-search';

/** Bus Rates history and the sales agent's SF pop-up. */

const HOUR_MS = 3_600_000;
const ASK_AGAIN_HOURS = 4;
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface ShipmentRow {
  id: string;
  bus_company: string;
  destination: string;
  fee: number | string;
  weight_kg: number | string | null;
  declared_value: number | string | null;
  box_count: number | null;
  receipt_url: string | null;
  shipped_at: string;
  customer_id: string | null;
  sales_person_name: string | null;
  sf_owed: number | string;
  sf_extra: number | string;
  balance_after: number | string | null;
  ask_again_at: string | null;
  customers: { full_name: string | null; store_credit?: number | string | null } | null;
  bus_shipment_orders: { order_id: string }[] | null;
}

const SELECT = '*, customers(full_name, store_credit), bus_shipment_orders(order_id)';
const numOrNull = (v: unknown) => (v == null || v === '' ? null : Number(v));

/** Every recorded trip, newest first (a few a week, so all of them fit). */
export async function listBusTrips(supabase: SupabaseClient): Promise<BusTrip[]> {
  const { data, error } = await supabase.from('bus_shipments').select(SELECT).order('shipped_at', { ascending: false }).limit(1000);
  if (error) throw error;
  return ((data || []) as ShipmentRow[]).map((r) => ({
    id: r.id,
    busCompany: r.bus_company,
    destination: r.destination,
    fee: Number(r.fee),
    weightKg: numOrNull(r.weight_kg),
    declaredValue: numOrNull(r.declared_value),
    boxCount: r.box_count,
    shippedAt: r.shipped_at,
    orderIds: (r.bus_shipment_orders || []).map((o) => o.order_id),
    customerName: r.customers?.full_name || null,
    receiptUrl: r.receipt_url,
  }));
}

/** "Owed" clears by itself once the orders' balance has dropped by the SF owed (a payment was logged). */
async function settlePaidOwed(supabase: SupabaseClient, rows: ShipmentRow[]): Promise<Set<string>> {
  const settled = new Set<string>();
  const owed = rows.filter((r) => Number(r.sf_owed) > 0.009 && r.balance_after != null);
  const orderIds = owed.flatMap((r) => (r.bus_shipment_orders || []).map((o) => o.order_id));
  if (orderIds.length === 0) return settled;
  const { data } = await supabase.from('orders').select('id, balance_due').in('id', orderIds);
  const balance = new Map(((data || []) as { id: string; balance_due: unknown }[]).map((o) => [o.id, Number(o.balance_due || 0)]));
  for (const r of owed) {
    const now = (r.bus_shipment_orders || []).reduce((s, o) => s + (balance.get(o.order_id) || 0), 0);
    if (now <= Number(r.balance_after) - Number(r.sf_owed) + 0.01) {
      await supabase.from('bus_shipments').update({
        settled_at: new Date().toISOString(), settled_by_name: 'System', settle_note: 'SF paid',
      }).eq('id', r.id);
      settled.add(r.id);
    }
  }
  return settled;
}

/** Trips where this agent must collect SF or decide about extra SF. Owners also see trips with no agent. */
export async function listBusSfPrompts(
  supabase: SupabaseClient,
  caller: { name: string; isManagement: boolean },
): Promise<BusSfPrompt[]> {
  const { data, error } = await supabase.from('bus_shipments').select(SELECT).is('settled_at', null);
  if (error) throw error;
  const rows = (data || []) as ShipmentRow[];
  const settled = await settlePaidOwed(supabase, rows);
  const me = caller.name.trim().toLowerCase();
  const now = Date.now();
  return rows
    .filter((r) => !settled.has(r.id))
    .filter((r) => !r.ask_again_at || new Date(r.ask_again_at).getTime() <= now)
    .filter((r) => {
      const agent = String(r.sales_person_name || '').trim().toLowerCase();
      return agent ? agent === me : caller.isManagement;
    })
    .map((r) => {
      const owed = Number(r.sf_owed);
      return {
        id: r.id,
        kind: owed > 0.009 ? 'owed' as const : 'extra' as const,
        amount: owed > 0.009 ? owed : Number(r.sf_extra),
        customerName: r.customers?.full_name || 'Customer',
        customerId: r.customer_id,
        storeCredit: Number(r.customers?.store_credit || 0),
        orderIds: (r.bus_shipment_orders || []).map((o) => o.order_id),
        busCompany: r.bus_company,
        destination: r.destination,
        fee: Number(r.fee),
        shippedAt: r.shipped_at,
        salesPersonName: r.sales_person_name,
      };
    });
}

/**
 * The agent's answer. Owed: "waiting" asks again in 4 hours (it clears when the
 * payment is logged). Extra (already in store credit): keep it as store credit,
 * call it a tip (taken out of store credit), or refund (owners are told).
 */
export async function answerBusSfPrompt(
  supabase: SupabaseClient,
  id: string,
  answer: BusSfAnswer,
  actorName: string,
): Promise<void> {
  const { data, error } = await supabase.from('bus_shipments').select(SELECT).eq('id', id).single();
  if (error || !data) throw new Error('Bus trip not found.');
  const r = data as ShipmentRow;
  const now = new Date().toISOString();
  if (answer === 'waiting') {
    await supabase.from('bus_shipments').update({ ask_again_at: new Date(Date.now() + ASK_AGAIN_HOURS * HOUR_MS).toISOString() }).eq('id', id);
    return;
  }
  const extra = Number(r.sf_extra);
  if (Number(r.sf_owed) > 0.009 || !(extra > 0)) throw new Error('Nothing extra to decide on this trip.');
  const orders = (r.bus_shipment_orders || []).map((o) => `#${shortOrder(o.order_id)}`).join(', ');
  const customer = r.customers?.full_name || 'Customer';
  let note = `Extra ${peso(extra)} kept as store credit`;
  if (answer === 'tip' && r.customer_id) {
    const { data: c } = await supabase.from('customers').select('store_credit').eq('id', r.customer_id).single();
    const credit = Number(c?.store_credit || 0);
    const take = round2(Math.min(credit, extra));
    if (take > 0) await supabase.from('customers').update({ store_credit: round2(credit - take) }).eq('id', r.customer_id);
    note = `Extra ${peso(extra)} is a tip / keep the change (${peso(take)} taken out of store credit)`;
  } else if (answer === 'refund') {
    note = `Refund extra ${peso(extra)}: owners told`;
    await notifyOwners(
      supabase,
      'Bus SF: refund extra SF',
      `${customer} (${orders}) sent ${peso(extra)} more than the bus fee (${r.bus_company} → ${r.destination}). ` +
        `${actorName} says refund it. It is in their store credit until refunded.`,
      undefined,
      '/dashboard/bus-shipping',
    );
  }
  await supabase.from('bus_shipments').update({ settled_at: now, settled_by_name: actorName, settle_note: note }).eq('id', id);
}
