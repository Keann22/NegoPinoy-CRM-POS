-- Priority list (phase 1): customer follow-ups and "customer asked to hold"
-- dates, logged by sales per order. One row per tap, so the history stays.
--   kind = 'followup'      customer chased the order (live / chat); note says how
--   kind = 'hold'          customer asked to wait; hold_until = when it comes back
--   kind = 'hold_cleared'  hold removed early
-- The current hold for an order is its latest 'hold' / 'hold_cleared' row.

CREATE TABLE IF NOT EXISTS order_priority_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('followup', 'hold', 'hold_cleared')),
  note text,
  hold_until date,
  created_by_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_priority_events_order_idx
  ON order_priority_events (order_id, created_at);

-- Server routes use the service role; no browser access.
ALTER TABLE order_priority_events ENABLE ROW LEVEL SECURITY;
