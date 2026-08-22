-- The "Staff Req." quantity on the Procurement sheet is
-- purchase_order_items.expected_qty. Most of it is order-linked demand, mirrored
-- row-for-row in procurement_request_sources (the orders shown in the detail
-- dialog). But the "Add Missing Item" flow lets staff add order-less demand that
-- has no order to point to, so it can never be recorded as a source.
--
-- Without somewhere to record that order-less portion, the reconciliation in
-- autoCleanupStaffDrafts can't tell a legitimate manual add apart from phantom
-- demand left behind by a lost source, and would clamp both away. manual_qty
-- stores that order-less portion explicitly so it survives reconciliation:
-- expected_qty is healed down to sum(sources) + manual_qty, never below it.
alter table public.purchase_order_items
  add column if not exists manual_qty integer not null default 0;
