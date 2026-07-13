-- Extends order_issues so it can also hold purchase-receiving discrepancies
-- (bulk receive shortages), sharing the existing Inbox Drawer + urgent-toast
-- realtime plumbing that already listens on order_issue_messages.
-- order_id is now nullable because purchase-type issues aren't tied to an order.
alter table public.order_issues
  alter column order_id drop not null,
  add column if not exists issue_type text not null default 'order',
  add column if not exists po_id uuid references public.purchase_orders(id);
