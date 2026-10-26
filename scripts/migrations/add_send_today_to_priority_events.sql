-- Priority list (phase 2): "send today" marks on order_priority_events.
--   kind = 'send_today'            sales / jas marked it; send_date = the day it must be booked
--   kind = 'send_today_blocked'    warehouse can't send it; reason_code says why
--                                  (item_os | customer_hold | payment_check | other)
--   kind = 'send_today_cancelled'  sales removed the mark
-- The current send-today state is the order's latest send_today* row.
-- Done = the order reached For Pick-up (SPX Excel sync), so nothing is stored for it.

ALTER TABLE order_priority_events DROP CONSTRAINT IF EXISTS order_priority_events_kind_check;
ALTER TABLE order_priority_events ADD CONSTRAINT order_priority_events_kind_check CHECK (
  kind IN ('followup', 'hold', 'hold_cleared', 'send_today', 'send_today_blocked', 'send_today_cancelled')
);

ALTER TABLE order_priority_events
  ADD COLUMN IF NOT EXISTS send_date date,
  ADD COLUMN IF NOT EXISTS reason_code text;

CREATE INDEX IF NOT EXISTS order_priority_events_kind_idx
  ON order_priority_events (kind, created_at);

NOTIFY pgrst, 'reload schema';
