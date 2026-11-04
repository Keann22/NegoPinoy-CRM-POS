-- Only one box of an order came back (owner, 2026-11-04). See
-- docs/BUSINESS_WORKFLOW.md "Only one box came back".
--
--   partial    the case covers only some of the order's boxes: the order is not
--              voided; resend makes a new order for the box (money moves with
--              it); cancel removes the box's items from the order
--   box_names  which box(es) came back, e.g. "Box 2"
-- Only adds columns; nothing existing changes.

alter table public.customer_returns
  add column if not exists partial boolean not null default false,
  add column if not exists box_names text;

notify pgrst, 'reload schema';

select count(*) as new_columns
from information_schema.columns
where table_name = 'customer_returns' and column_name in ('partial', 'box_names');
