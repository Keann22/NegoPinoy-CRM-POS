-- Reserve stock for a replacement (owner, 2026-11-03).
-- Sales marks an order "Reserved for replacement" on the Priority List; until it is
-- picked, pickers can't give that item to another order (owners can override with a
-- reason) and Receiving shows who the arriving pieces are for.
--   kind = 'reserve'          reserved (note = why, e.g. "palit sa leaking jar ni Virginia")
--   kind = 'reserve_cleared'  reservation removed
-- Same list as add_urgent_and_paid_notice_events.sql plus the two new kinds.

ALTER TABLE order_priority_events DROP CONSTRAINT IF EXISTS order_priority_events_kind_check;
ALTER TABLE order_priority_events ADD CONSTRAINT order_priority_events_kind_check CHECK (
  kind IN (
    'followup', 'hold', 'hold_cleared',
    'send_today', 'send_today_blocked', 'send_today_cancelled',
    'os_decision',
    'urgent', 'urgent_cleared', 'paid_notice',
    'reserve', 'reserve_cleared'
  )
);

NOTIFY pgrst, 'reload schema';
