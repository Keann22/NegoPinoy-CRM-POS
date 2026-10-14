import { SupabaseClient } from '@supabase/supabase-js';
import { findStage, isTrackingRoute, ROUTE_STAGES, type TrackingRoute } from '@/lib/online-order-tracking';

export type TrackingInput = {
  route?: string | null;
  platformOrderNo?: string | null;
  trackingNo?: string | null;
  stage?: string | null;
  expectedArrival?: string | null;
  note?: string | null;
};

const clean = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

/**
 * Updates a purchase order's shipment details. A stage change is also logged
 * to purchase_order_tracking_events so the shipment keeps its history.
 * Fields left undefined are not touched.
 */
export async function updatePoTracking(
  supabase: SupabaseClient,
  poId: string,
  input: TrackingInput,
  actorName: string
) {
  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .select('id, notes, tracking_route, tracking_stage')
    .eq('id', poId)
    .single();
  if (poErr || !po) throw new Error('Purchase order not found');
  if (po.notes === 'STAFF_DRAFT') throw new Error('Staff requests cannot be tracked');

  const update: Record<string, any> = {};

  let route: TrackingRoute | null = po.tracking_route;
  if (input.route !== undefined) {
    if (input.route !== null && !isTrackingRoute(input.route)) throw new Error('Unknown tracking route');
    route = input.route;
    update.tracking_route = route;
  }
  if (!route) {
    // Turning tracking off clears the shipment fields.
    Object.assign(update, { tracking_stage: null, tracking_stage_at: null });
  }

  if (input.platformOrderNo !== undefined) update.platform_order_no = clean(input.platformOrderNo);
  if (input.trackingNo !== undefined) update.tracking_no = clean(input.trackingNo);
  if (input.expectedArrival !== undefined) update.expected_arrival = clean(input.expectedArrival);

  let newStage: string | null = null;
  if (route) {
    if (input.stage && !findStage(route, input.stage)) throw new Error('Unknown tracking stage');
    // A route change can leave the old stage invalid; fall back to the first stage.
    const requested = input.stage || po.tracking_stage;
    const stage = findStage(route, requested) || ROUTE_STAGES[route][0];
    if (stage.key !== po.tracking_stage) {
      newStage = stage.key;
      update.tracking_stage = stage.key;
      update.tracking_stage_at = new Date().toISOString();
    }
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from('purchase_orders').update(update).eq('id', poId);
    if (error) throw error;
  }

  const note = clean(input.note);
  if (newStage || note) {
    const { error } = await supabase.from('purchase_order_tracking_events').insert({
      po_id: poId,
      // 'note' marks a note added without a stage change.
      stage: newStage || 'note',
      note,
      created_by_name: actorName,
    });
    if (error) throw error;
  }
}

/** One shipment with its items and stage history, for the tracking dialog. */
export async function getPoTracking(supabase: SupabaseClient, poId: string) {
  const [{ data: po, error: poErr }, { data: items, error: iErr }, { data: events, error: eErr }] = await Promise.all([
    supabase
      .from('purchase_orders')
      .select('id, created_at, notes, tracking_route, platform_order_no, tracking_no, tracking_stage, tracking_stage_at, expected_arrival')
      .eq('id', poId)
      .single(),
    supabase
      .from('purchase_order_items')
      .select('id, product_id, expected_qty, received_qty, unit_cost, status, suppliers(name), products(name, variant_name)')
      .eq('po_id', poId),
    supabase
      .from('purchase_order_tracking_events')
      .select('id, stage, note, created_by_name, created_at')
      .eq('po_id', poId)
      .order('created_at', { ascending: false }),
  ]);
  if (poErr || !po) throw new Error('Purchase order not found');
  if (iErr) throw iErr;
  if (eErr) throw eErr;

  return {
    po: {
      id: po.id,
      orderedAt: po.created_at,
      route: po.tracking_route,
      platformOrderNo: po.platform_order_no,
      trackingNo: po.tracking_no,
      stage: po.tracking_stage,
      stageAt: po.tracking_stage_at,
      expectedArrival: po.expected_arrival,
    },
    // Lines still waiting on units first.
    items: [...(items || [])]
      .sort((a: any, b: any) => Number(a.received_qty >= a.expected_qty) - Number(b.received_qty >= b.expected_qty))
      .map((i: any) => {
      let name = i.products?.name || 'Unknown Product';
      if (i.products?.variant_name && !name.includes(i.products.variant_name)) name = `${name} [${i.products.variant_name}]`;
      return {
        id: i.id,
        productId: i.product_id,
        productName: name,
        supplierName: i.suppliers?.name || null,
        expectedQty: Number(i.expected_qty) || 0,
        receivedQty: Number(i.received_qty) || 0,
        unitCost: Number(i.unit_cost) || 0,
        status: i.status,
      };
    }),
    events: (events || []).map((e: any) => ({
      id: e.id,
      stage: e.stage,
      note: e.note,
      by: e.created_by_name,
      at: e.created_at,
    })),
  };
}

/** Display name for whoever is making a change, from the session user. */
export function actorNameFor(user: any): string {
  // Same name the dashboard shows (useUserProfile reads first_name / last_name).
  const m = user?.user_metadata || {};
  const profileName = `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
  return profileName || m.full_name || user?.email || 'Admin';
}
