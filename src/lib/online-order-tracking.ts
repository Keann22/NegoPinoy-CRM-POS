// Shipment stages for online purchases (Pinduoduo, Shopee, ...), shared by the
// Procurement Sheet UI and the tracking API. Stage keys are stored in
// purchase_orders.tracking_stage / purchase_order_tracking_events.stage, so
// never rename a key — only its label.

export type TrackingRoute = 'china_import' | 'local';

export type TrackingPhase =
  | 'seller'
  | 'cn_warehouse'
  | 'cn_customs'
  | 'shipping'
  | 'ph_customs'
  | 'ph_courier'
  | 'out_for_delivery'
  | 'delivered';

export type TrackingStage = { key: string; label: string; phase: TrackingPhase };

export const PHASE_LABELS: Record<TrackingPhase, string> = {
  seller: 'With seller',
  cn_warehouse: 'China warehouse',
  cn_customs: 'China customs',
  shipping: 'Shipping to PH',
  ph_customs: 'PH customs',
  ph_courier: 'PH courier',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
};

export const ROUTE_LABELS: Record<TrackingRoute, string> = {
  china_import: 'China import (via consolidator)',
  local: 'Local delivery',
};

// The Pinduoduo → consolidator → sea freight → J&T path, in order.
const CHINA_IMPORT_STAGES: TrackingStage[] = [
  { key: 'ordered', label: 'Ordered', phase: 'seller' },
  { key: 'packed', label: 'Packed', phase: 'seller' },
  { key: 'shipped_by_seller', label: 'Shipped by seller', phase: 'seller' },
  { key: 'accepted_by_consolidator', label: 'Accepted by consolidation', phase: 'cn_warehouse' },
  { key: 'reached_warehouse', label: 'Reached warehouse', phase: 'cn_warehouse' },
  { key: 'dispatched_from_warehouse', label: 'Dispatched from warehouse', phase: 'cn_warehouse' },
  { key: 'cn_customs_in_progress', label: 'China customs declaration in progress', phase: 'cn_customs' },
  { key: 'cn_customs_completed', label: 'China customs declaration completed', phase: 'cn_customs' },
  { key: 'in_transit_to_ph', label: 'In transit to destination country', phase: 'shipping' },
  { key: 'arrived_ph_port', label: 'Philippines – arrived at port', phase: 'shipping' },
  { key: 'vessel_berthed', label: 'Vessel berthed – awaiting discharge', phase: 'shipping' },
  { key: 'ph_customs_in_progress', label: 'Philippines customs clearance in progress', phase: 'ph_customs' },
  { key: 'ph_customs_completed', label: 'Philippines customs clearance completed', phase: 'ph_customs' },
  { key: 'picked_up_from_shipper', label: 'Picked up from shipper', phase: 'ph_courier' },
  { key: 'arrived_at_warehouse', label: 'Arrived at warehouse', phase: 'ph_courier' },
  { key: 'received_by_jnt', label: 'Package received by J&T', phase: 'ph_courier' },
  { key: 'departing_pasig_cb', label: 'Package departing from Pasig CB', phase: 'ph_courier' },
  { key: 'arrived_pasig', label: 'Package arrived in Pasig', phase: 'ph_courier' },
  { key: 'departing_pasig', label: 'Package departing from Pasig', phase: 'ph_courier' },
  { key: 'arrived_parada', label: 'Package arrived at Parada', phase: 'ph_courier' },
  { key: 'departing_parada', label: 'Package departing from Parada', phase: 'ph_courier' },
  { key: 'arrived_san_jose', label: 'Package arrived in Manila San Jose', phase: 'ph_courier' },
  { key: 'out_for_delivery', label: 'Package is out for delivery', phase: 'out_for_delivery' },
  { key: 'delivered', label: 'Delivered', phase: 'delivered' },
];

// Domestic Shopee / Lazada orders: no customs, no consolidator.
const LOCAL_STAGES: TrackingStage[] = [
  { key: 'ordered', label: 'Ordered', phase: 'seller' },
  { key: 'packed', label: 'Packed', phase: 'seller' },
  { key: 'shipped_by_seller', label: 'Shipped by seller', phase: 'seller' },
  { key: 'in_transit', label: 'In transit', phase: 'ph_courier' },
  { key: 'arrived_hub', label: 'Arrived at delivery hub', phase: 'ph_courier' },
  { key: 'out_for_delivery', label: 'Out for delivery', phase: 'out_for_delivery' },
  { key: 'delivered', label: 'Delivered', phase: 'delivered' },
];

export const ROUTE_STAGES: Record<TrackingRoute, TrackingStage[]> = {
  china_import: CHINA_IMPORT_STAGES,
  local: LOCAL_STAGES,
};

export const DEFAULT_TRANSIT_DAYS: Record<TrackingRoute, number> = {
  china_import: 30,
  local: 7,
};

// Without an expected date, anything older than this is flagged.
export const OVERDUE_FALLBACK_DAYS = 30;

export function isTrackingRoute(v: unknown): v is TrackingRoute {
  return v === 'china_import' || v === 'local';
}

export function findStage(route: TrackingRoute | null | undefined, key: string | null | undefined): TrackingStage | null {
  if (!route || !key) return null;
  return ROUTE_STAGES[route]?.find((s) => s.key === key) || null;
}

export function stageIndex(route: TrackingRoute, key: string | null | undefined): number {
  return ROUTE_STAGES[route].findIndex((s) => s.key === key);
}

/** Which tracking path a supplier's purchases usually take, or null if it's not an online platform. */
export function guessRouteForSupplier(supplierName: string | null | undefined): TrackingRoute | null {
  const n = (supplierName || '').toLowerCase();
  if (/pin\s*d|pdd|taobao|1688|temu|alibaba|aliexpress/.test(n)) return 'china_import';
  if (/shopee|lazada|tiktok/.test(n)) return 'local';
  return null;
}

/** yyyy-mm-dd, `days` from today in Philippine time. */
export function defaultExpectedArrival(route: TrackingRoute, from = new Date()): string {
  const pht = new Date(from.getTime() + 8 * 3600 * 1000);
  pht.setUTCDate(pht.getUTCDate() + DEFAULT_TRANSIT_DAYS[route]);
  return pht.toISOString().slice(0, 10);
}

export function daysSince(iso: string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000));
}

export type TransitStatus = 'delivered' | 'overdue' | 'due_soon' | 'on_track';

/** Colour state of a shipment: delivered (go receive it), overdue, due within 3 days, or on track. */
export function transitStatus(
  shipment: { stage: string | null; expectedArrival: string | null; orderedAt: string },
  now = new Date()
): TransitStatus {
  if (shipment.stage === 'delivered') return 'delivered';
  if (shipment.expectedArrival) {
    // Compare calendar days in PHT.
    const today = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    if (shipment.expectedArrival < today) return 'overdue';
    const diff = (new Date(shipment.expectedArrival).getTime() - new Date(today).getTime()) / 86400000;
    return diff <= 3 ? 'due_soon' : 'on_track';
  }
  return daysSince(shipment.orderedAt, now) > OVERDUE_FALLBACK_DAYS ? 'overdue' : 'on_track';
}

const STATUS_RANK: Record<TransitStatus, number> = { overdue: 3, delivered: 2, due_soon: 1, on_track: 0 };

/** The status that most needs attention, for a chip summarising several shipments. */
export function worstStatus(statuses: TransitStatus[]): TransitStatus {
  return statuses.reduce<TransitStatus>((w, s) => (STATUS_RANK[s] > STATUS_RANK[w] ? s : w), 'on_track');
}
