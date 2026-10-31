-- Customer Returns, phase 2. Needs 2026-10-30_customer_returns.sql first.
-- See architecture.md "Customer Returns".
--
--   shipping_payer        who pays shipping on a replacement ('us' = free shipping, 'customer' = SF only)
--   replacement_order_id  the ₱0 replacement order made from the case
--   refund_*              how a refund was paid; the money itself is an expenses row
--   credit_given          store credit added to customers.store_credit
-- Only adds columns; nothing existing changes.

alter table public.customer_returns
  add column if not exists shipping_payer text check (shipping_payer in ('us', 'customer')),
  add column if not exists replacement_order_id uuid references public.orders(id),
  add column if not exists refund_expense_id uuid references public.expenses(id),
  add column if not exists refund_method text,
  add column if not exists refund_reference text,
  add column if not exists credit_given numeric not null default 0;

create index if not exists customer_returns_replacement_idx on public.customer_returns (replacement_order_id);

notify pgrst, 'reload schema';

select count(*) as phase2_columns
from information_schema.columns
where table_name = 'customer_returns'
  and column_name in ('shipping_payer', 'replacement_order_id', 'refund_expense_id', 'refund_method', 'refund_reference', 'credit_given');
