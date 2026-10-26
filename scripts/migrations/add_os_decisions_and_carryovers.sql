-- Priority list (phase 3): sales decisions on out-of-stock items, and
-- "to follow" items carried over to the customer's next order.

-- 1. Decisions are order_priority_events rows:
--    kind = 'os_decision', product_id = the OS item, reason_code =
--      'wait'       customer waits; the item stays on the order and gets bought
--      'carry_over' send the rest now; the item follows with the next order
--      'remove'     customer no longer wants it; sales removes it from the order
ALTER TABLE order_priority_events ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id);

ALTER TABLE order_priority_events DROP CONSTRAINT IF EXISTS order_priority_events_kind_check;
ALTER TABLE order_priority_events ADD CONSTRAINT order_priority_events_kind_check CHECK (
  kind IN ('followup', 'hold', 'hold_cleared', 'send_today', 'send_today_blocked', 'send_today_cancelled', 'os_decision')
);

-- 2. Items owed to a customer from an earlier order. The money they paid for
--    it is already store credit (removing a paid item from an order converts
--    it); this row remembers WHICH item that credit is for.
CREATE TABLE IF NOT EXISTS customer_carryovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  product_name text NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  unit_price numeric NOT NULL DEFAULT 0,   -- what the customer paid per unit (after discount)
  unit_cost numeric NOT NULL DEFAULT 0,    -- cost per unit on the original order, for COGS on the next one
  from_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'added', 'cancelled')),
  added_to_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_by_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_by_name text,
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS customer_carryovers_open_idx
  ON customer_carryovers (customer_id) WHERE status = 'open';

-- Server routes use the service role; no browser access.
ALTER TABLE customer_carryovers ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
