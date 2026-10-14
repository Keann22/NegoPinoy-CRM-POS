-- Online order tracking (Pinduoduo / Shopee / etc.) on the Procurement Sheet.
-- A purchase order = one platform checkout, so the shipment details live on
-- purchase_orders. Stage keys are defined in src/lib/online-order-tracking.ts.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS tracking_route text,          -- 'china_import' | 'local'; null = not an online order
  ADD COLUMN IF NOT EXISTS platform_order_no text,
  ADD COLUMN IF NOT EXISTS tracking_no text,
  ADD COLUMN IF NOT EXISTS tracking_stage text,
  ADD COLUMN IF NOT EXISTS tracking_stage_at timestamptz,
  ADD COLUMN IF NOT EXISTS expected_arrival date;

CREATE INDEX IF NOT EXISTS purchase_orders_tracking_route_idx
  ON purchase_orders (tracking_route) WHERE tracking_route IS NOT NULL;

-- Every stage change, with who made it, so the shipment has a history.
CREATE TABLE IF NOT EXISTS purchase_order_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  stage text NOT NULL,
  note text,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_order_tracking_events_po_idx
  ON purchase_order_tracking_events (po_id, created_at);

-- Server routes use the service role; no browser access.
ALTER TABLE purchase_order_tracking_events ENABLE ROW LEVEL SECURITY;
