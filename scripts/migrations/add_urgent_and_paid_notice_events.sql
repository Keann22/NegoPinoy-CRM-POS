-- Priority list: "nagmamadali" (customer is in a hurry) and "now fully paid" notices.
--   kind = 'urgent'          sales/admin marked the customer as in a hurry (note = what they said)
--   kind = 'urgent_cleared'  no longer in a hurry
--   kind = 'paid_notice'     the order became fully paid and staff were notified (once per order)

ALTER TABLE order_priority_events DROP CONSTRAINT IF EXISTS order_priority_events_kind_check;
ALTER TABLE order_priority_events ADD CONSTRAINT order_priority_events_kind_check CHECK (
  kind IN (
    'followup', 'hold', 'hold_cleared',
    'send_today', 'send_today_blocked', 'send_today_cancelled',
    'os_decision',
    'urgent', 'urgent_cleared', 'paid_notice'
  )
);

-- One "fully paid" notice per order, even if two screens check at the same moment.
CREATE UNIQUE INDEX IF NOT EXISTS order_priority_events_one_paid_notice
  ON order_priority_events (order_id) WHERE kind = 'paid_notice';

NOTIFY pgrst, 'reload schema';
