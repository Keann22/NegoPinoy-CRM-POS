-- Courier returns flow (owner, 2026-11-03). See docs/BUSINESS_WORKFLOW.md
-- "Courier returns in practice" and architecture.md "Customer Returns".
--
-- Sales decides resend / cancel for courier returns (RTS). When they are still
-- waiting for the customer, the question comes back after 4 hours; after 3 days
-- the owners decide.
--   waiting_customer_at       first time sales said "asked customer, waiting for reply"
--   waiting_customer_by_name  who said it
--   ask_again_at              when the pop-up asks again (null = ask now)
-- Only adds columns; nothing existing changes.

alter table public.customer_returns
  add column if not exists waiting_customer_at timestamptz,
  add column if not exists waiting_customer_by_name text,
  add column if not exists ask_again_at timestamptz;

notify pgrst, 'reload schema';

select count(*) as new_columns
from information_schema.columns
where table_name = 'customer_returns'
  and column_name in ('waiting_customer_at', 'waiting_customer_by_name', 'ask_again_at');
